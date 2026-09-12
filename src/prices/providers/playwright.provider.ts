import { chromium } from "playwright";
import { setTimeout as pause } from "node:timers/promises";
import { eanVariants, selectedTargets } from "../config.js";
import { matchExactEan, matchDescription } from "../matching.js";
import type { PriceProvider, RefreshOptions, RefreshResult } from "../types.js";
import type { CatalogCandidate } from "./vtex-parser.js";
import { ecommerceStoreContexts, matchesStoreContext } from "../store-contexts.js";

export type EcommerceConfig = {
  key: string; origin: string; searchName: RegExp;
  parse: (payload: unknown) => CatalogCandidate[];
  structured?: boolean;
};

const blocked = (text: string) => /verify you are human|verifica que (?:eres|sos) humano|access denied|verifying your browser|unusual traffic|just a moment/i.test(text);

// Una sesión nueva por cadena. Lee las respuestas que provoca el buscador real;
// no reproduce endpoints privados, no guarda cookies, no elude autenticación.
export class EcommercePlaywrightProvider implements PriceProvider {
  readonly name: string;
  constructor(private readonly config: EcommerceConfig) { this.name = config.key.toUpperCase(); }
  async refresh(options: RefreshOptions = {}): Promise<RefreshResult> {
    const started = Date.now();
    const targets = selectedTargets(options.product);
    const result: RefreshResult = { provider: this.name, productsSearched: [], productsFound: [], productsNotFound: [], offersUpdated: 0, unmapped: 0, unmatched: 0, errors: [], durationMs: 0, observations: [] };
    let browser;
    let stage = "browser";
    try {
      // Chrome ya está disponible en la máquina de la PoC. "chromium" usa el
      // binario Playwright si se instala en otra máquina.
      const channel = process.env.PRICES_BROWSER_CHANNEL ?? "chrome";
      browser = await chromium.launch({ headless: true, ...(channel === "chromium" ? {} : { channel }), timeout: 30000 });
      const context = await browser.newContext();
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      page.setDefaultNavigationTimeout(30000);
      const home = await page.goto(this.config.origin, { waitUntil: "domcontentloaded" });
      if ([401, 403, 429].includes(home?.status() ?? 0)) throw new Error("Sitio bloqueado o limitado; se conserva SEPA.");
      stage = "home-searchbox";
      await page.getByRole("textbox", { name: this.config.searchName }).first().waitFor({ timeout: 20000 });
      await pause(2000); // Dejar completar la hidratación del buscador publicado.
      const reject = page.getByRole("button", { name: "Rechazar todo", exact: true });
      if (await reject.isVisible()) await reject.click();
      for (const target of targets) {
        stage = `${target.key}: search`;
        result.productsSearched.push(target.key);
        const candidates: CatalogCandidate[] = [];
        const pending: Promise<void>[] = [];
        const listener = (response: import("playwright").Response) => {
          const url = new URL(response.url());
          if (url.origin !== new URL(this.config.origin).origin || !/productSearch/i.test(url.searchParams.get("operationName") ?? "")) return;
          pending.push((async () => {
            if (!response.ok()) return;
            try { candidates.push(...this.config.parse(await response.json())); } catch { /* Respuesta no JSON: no inferir productos. */ }
          })());
        };
        page.on("response", listener);
        try {
          const search = page.getByRole("textbox", { name: this.config.searchName }).first();
          await search.fill(target.aliases[0]!);
          const observed = this.config.structured ? Promise.resolve(null) : page.waitForResponse((response) => {
            const url = new URL(response.url());
            return url.origin === new URL(this.config.origin).origin && /productSearch/i.test(url.searchParams.get("operationName") ?? "");
          }, { timeout: 20000 });
          // Adjuntar catch antes de press evita rechazos no manejados si el DOM cambia.
          const outcome = observed.catch(() => null);
          await search.press("Enter");
          if (this.config.structured) {
            stage = `${target.key}: search-url`;
            await page.waitForURL((url) => url.searchParams.get("_q")?.toLowerCase() === target.aliases[0]!.toLowerCase(), { timeout: 20000, waitUntil: "domcontentloaded" });
            stage = `${target.key}: search-title`;
            await page.waitForFunction((query) => document.title.toLowerCase().includes(query.toLowerCase()), target.aliases[0]!, { timeout: 15000 });
            await pause(2000);
            stage = `${target.key}: structured-data`;
            const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
            for (const script of scripts) { try { candidates.push(...this.config.parse(JSON.parse(script))); } catch { /* JSON-LD inválido: omitir. */ } }
          }
          const response = await outcome;
          if (response && [401, 403, 429].includes(response.status())) throw new Error("Sitio bloqueado o limitado; se conserva SEPA.");
          if (blocked(await page.locator("body").innerText())) throw new Error("Protección del sitio detectada; no se reintenta.");
          await Promise.all(pending);
          if (!response && !this.config.structured) result.errors.push(`${target.key}: no se observó una respuesta de catálogo compatible.`);
          const unique = new Map(candidates.map((candidate) => [candidate.ean ?? candidate.url, candidate]));
          const mapping = ecommerceStoreContexts[this.name];
          const mappedStore = mapping && matchesStoreContext(await page.locator(mapping.selector).allTextContents(), mapping) ? mapping.store : null;
          for (const candidate of unique.values()) {
            const match = candidate.ean ? matchExactEan(candidate.ean, candidate.name, [target]) : matchDescription(candidate.name, candidate.brand, [target]);
            if (!match || !candidate.price) { result.unmatched++; continue; }
            if (!result.productsFound.includes(target.key)) result.productsFound.push(target.key);
            if (!mappedStore || !candidate.ean) {
              result.unmapped++;
              (result.unmappedDetails ??= []).push({ productKey: target.key, ean: candidate.ean, name: candidate.name, price: candidate.price, regularPrice: candidate.regularPrice, stock: candidate.stock, url: candidate.url, checkedAt: new Date().toISOString() });
            }
            if (!candidate.ean) continue;
            result.observations.push({ product: { key: target.key, ean: candidate.ean!, brand: target.brand, name: target.name, variant: eanVariants[candidate.ean!] ?? target.variant, size: target.size },
              store: mappedStore, price: candidate.price, stock: candidate.stock, source: `REAL:PLAYWRIGHT:${this.name}`,
              lastCheckedAt: new Date(), productUrl: candidate.url,
              observedName: candidate.name, regularPrice: candidate.regularPrice,
            });
          }
        } finally { page.off("response", listener); }
        await pause(2000);
      }
    } catch (error) {
      // Nunca imprimir errores completos del navegador (pueden incluir headers/URLs).
      result.errors.push(error instanceof Error && /^(Sitio bloqueado|Protección del sitio)/.test(error.message) ? error.message : `${stage}: navegador/buscador no disponible o timeout; se conserva SEPA.`);
    } finally {
      await browser?.close();
      result.productsNotFound = targets.filter((t) => !result.productsFound.includes(t.key)).map((t) => t.key);
      result.durationMs = Date.now() - started;
    }
    return result;
  }
}
