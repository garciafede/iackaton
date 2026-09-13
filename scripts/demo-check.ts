import "dotenv/config";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { prisma } from "../src/lib/prisma.js";
import { priceConfig, productTargets } from "../src/prices/config.js";
import { discoverSepaResource } from "../src/prices/providers/sepa.provider.js";
import { ecommerceStoreContexts } from "../src/prices/store-contexts.js";

export type Check = { name: string; status: "OK" | "WARN" | "ERROR"; detail: string };
export const checkExitCode = (checks: Check[]) => checks.some((check) => check.status === "ERROR") ? 1 : 0;
const required = ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "OPENAI_API_KEY", "OPENAI_MODEL", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_GRAPH_API_VERSION", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"];

export function checkEnvironment(env: NodeJS.ProcessEnv): Check {
  const missing = required.filter((key) => !env[key]?.trim());
  const invalid: string[] = [];
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) {
    if (!env[key]) continue;
    try { if (!["postgres:", "postgresql:"].includes(new URL(env[key]!).protocol)) invalid.push(key); }
    catch { invalid.push(key); }
  }
  if (env.WHATSAPP_PHONE_NUMBER_ID && !/^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID.trim())) invalid.push("WHATSAPP_PHONE_NUMBER_ID");
  if (env.WHATSAPP_GRAPH_API_VERSION && !/^v\d+\.\d+$/.test(env.WHATSAPP_GRAPH_API_VERSION.trim())) invalid.push("WHATSAPP_GRAPH_API_VERSION");
  if (!["development", "production", "test"].includes(env.NODE_ENV ?? "")) invalid.push("NODE_ENV");
  return { name: "variables env", status: missing.length || invalid.length ? "ERROR" : "OK",
    detail: [...(missing.length ? [`Faltan: ${missing.join(", ")}`] : []), ...(invalid.length ? [`Formato: ${invalid.join(", ")}`] : [])].join("; ") || "Configuradas; valores ocultos" };
}

// SET TRANSACTION READ ONLY impide escrituras incluso ante un cambio accidental.
export async function databaseSnapshot() {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$queryRaw`SELECT 1`;
    const products = await tx.product.count();
    const demoOffers = await tx.offer.count({ where: { source: "DEMO" } });
    const real = await tx.offer.findMany({
      where: { source: { startsWith: "REAL:" } },
      select: { productId: true, storeId: true, source: true, lastCheckedAt: true, price: true, stock: true,
        product: { select: { ean: true } }, store: { select: { chain: true, name: true, address: true, latitude: true, longitude: true } } },
    });
    const now = Date.now();
    const eligible = real.filter((offer) => offer.stock !== false && Number(offer.price) > 0 &&
      offer.lastCheckedAt.getTime() >= now - priceConfig.maxSourceAgeDays * 86400000 && offer.lastCheckedAt.getTime() <= now + 300000 &&
      Boolean(offer.store.name && offer.store.address && offer.store.chain) &&
      Number.isFinite(Number(offer.store.latitude)) && Math.abs(Number(offer.store.latitude)) <= 90 &&
      Number.isFinite(Number(offer.store.longitude)) && Math.abs(Number(offer.store.longitude)) <= 180);
    const latest = (rows: typeof real) => rows.length ? new Date(Math.max(...rows.map((row) => row.lastCheckedAt.getTime()))).toISOString() : null;
    const groups = productTargets.filter((target) => eligible.some((offer) => offer.product.ean && target.eans.includes(offer.product.ean)));
    const summarize = (key: "source" | "chain") => [...new Set(real.map((offer) => key === "source" ? offer.source! : offer.store.chain))].sort().map((value) => {
      const rows = real.filter((offer) => (key === "source" ? offer.source : offer.store.chain) === value);
      return { [key]: value, offers: rows.length, stores: new Set(rows.map((row) => row.storeId)).size, latest: latest(rows) };
    });
    return { products, demoOffers, realProducts: new Set(real.map((row) => row.productId)).size,
      configuredGroups: groups.length, targetGroups: productTargets.length, missingGroups: productTargets.filter((target) => !groups.includes(target)).map((target) => target.key),
      realOffers: real.length, eligibleRealOffers: eligible.length, realStores: new Set(real.map((row) => row.storeId)).size,
      latest: latest(real), bySource: summarize("source"), byChain: summarize("chain") };
  }, { maxWait: 10000, timeout: 20000 });
}

async function authenticationCheck(name: string, url: string, token: string | undefined, meta = false): Promise<Check> {
  if (!token) return { name, status: "ERROR", detail: "Credencial ausente; revisar .env localmente" };
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token.trim()}` }, signal: AbortSignal.timeout(15000), redirect: "error" });
    const body = await response.json().catch(() => null) as { error?: { code?: unknown; error_subcode?: unknown } } | null;
    const code = typeof body?.error?.code === "number" ? `; code ${body.error.code}` : "";
    const subcode = typeof body?.error?.error_subcode === "number" ? `; subcode ${body.error.error_subcode}` : "";
    return { name, status: response.ok ? "OK" : "ERROR", detail: `HTTP ${response.status}${code}${subcode}. ${response.ok ? meta ? "Lectura del Phone Number ID autorizada; envío pendiente de prueba manual" : "Acceso al modelo autorizado; saldo e inferencia se comprueban manualmente" : "Revisar credencial/permisos en el panel del proveedor"}` };
  } catch { return { name, status: "ERROR", detail: "No se pudo comprobar acceso (red, timeout o configuración); no se imprimen respuestas privadas" }; }
}

async function sepaCheck(): Promise<Check> {
  try {
    const response = await fetch(priceConfig.sepaCatalogUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { name: "SEPA", status: "WARN", detail: `Catálogo HTTP ${response.status}; se conservan los datos de PostgreSQL` };
    const resource = discoverSepaResource(await response.text());
    const old = Date.now() - new Date(resource.date).getTime() > priceConfig.maxSourceAgeDays * 86400000;
    let errors = 0;
    try { errors = JSON.parse(await readFile(".cache/prices/last-sepa-refresh.json", "utf8")).errors?.length ?? 0; } catch { /* Sin reporte local. */ }
    return { name: "SEPA", status: old || errors ? "WARN" : "OK", detail: `Último ZIP publicado: ${resource.date}${old ? "; publicación antigua" : ""}${errors ? `; último refresh con ${errors} advertencias` : ""}. No se descarga ni importa desde este check` };
  } catch { return { name: "SEPA", status: "WARN", detail: "Catálogo no verificable; usar los datos válidos de PostgreSQL" }; }
}

async function providerChecks(): Promise<Check[]> {
  const providers = [
    { key: "carrefour", name: "Carrefour provider", origin: "https://www.carrefour.com.ar" },
    { key: "vea", name: "Vea provider", origin: "https://www.vea.com.ar" },
    { key: "changomas", name: "ChangoMás provider", origin: "https://www.masonline.com.ar" },
  ];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const channel = process.env.PRICES_BROWSER_CHANNEL || "chrome";
    browser = await chromium.launch({ headless: true, ...(channel === "chromium" ? {} : { channel }), timeout: 15000 });
    const checks: Check[] = [];
    for (const provider of providers) {
      const page = await browser.newPage();
      try {
        const response = await page.goto(provider.origin, { waitUntil: "domcontentloaded", timeout: 10000 });
        const blocked = !response?.ok() || /captcha|access denied|verifica que eres humano/i.test(await page.locator("body").innerText({ timeout: 3000 }));
        const path = `.cache/prices/last-${provider.key}-refresh.json`;
        const report = JSON.parse(await readFile(path, "utf8")) as { errors?: unknown[]; productsSearched?: unknown[]; productsFound?: unknown[]; productsNotFound?: unknown[]; observations?: Array<{ store: unknown }> };
        const age = Date.now() - (await stat(path)).mtimeMs;
        const mapped = Boolean(ecommerceStoreContexts[provider.key.toUpperCase()]);
        const healthy = !blocked && age < 86400000 && !report.errors?.length && Boolean(report.productsFound?.length) && mapped && Boolean(report.observations?.some((row) => row.store));
        checks.push({ name: provider.name, status: healthy ? "OK" : "WARN",
          detail: `Inicio HTTP ${response?.status() ?? "sin respuesta"}; última extracción: ${report.productsFound?.length ?? 0}/${report.productsSearched?.length ?? 0} grupos consultados${blocked ? "; sitio no disponible/protegido" : ""}${age >= 86400000 ? "; reporte de más de 24 h" : ""}${report.errors?.length ? "; errores en extracción" : ""}${!mapped ? "; sin mapping físico, no importa precios web" : ""}` });
      } catch { checks.push({ name: provider.name, status: "WARN", detail: "No verificable (sitio, timeout o falta reporte); PostgreSQL se conserva" }); }
      finally { await page.close().catch(() => {}); }
    }
    return checks;
  } catch { return providers.map(({ name }) => ({ name, status: "WARN", detail: "Navegador no disponible; no afecta consultas a PostgreSQL" })); }
  finally { await browser?.close().catch(() => {}); }
}

export async function runDemoCheck() {
  const checks: Check[] = [
    { name: "Node", status: process.versions.node === "24.20.0" ? "OK" : "ERROR", detail: `${process.versions.node}; esperado 24.20.0` },
    checkEnvironment(process.env),
  ];
  const database = async () => {
    try {
      const summary = await databaseSnapshot();
      const old = !summary.latest || Date.now() - new Date(summary.latest).getTime() > 48 * 3600000;
      return { summary, checks: [
        { name: "Neon", status: "OK", detail: "SELECT y transacción READ ONLY completados" },
        { name: "productos", status: summary.configuredGroups === summary.targetGroups ? "OK" : "WARN", detail: `${summary.products} filas totales; ${summary.realProducts} EAN reales; ${summary.configuredGroups}/${summary.targetGroups} grupos con ofertas elegibles` },
        { name: "ofertas reales", status: summary.eligibleRealOffers > 0 && !old ? "OK" : "WARN", detail: `${summary.realOffers} guardadas; ${summary.eligibleRealOffers} elegibles; ${summary.realStores} sucursales; última ${summary.latest ?? "sin datos"}${old ? "; actualizar precios" : ""}` },
      ] as Check[] };
    } catch { return { summary: null, checks: [
      { name: "Neon", status: "ERROR", detail: "No se pudo leer la base; revisar red, conexión y migraciones" },
      { name: "productos", status: "WARN", detail: "No verificables sin Neon" },
      { name: "ofertas reales", status: "WARN", detail: "No verificables sin Neon" },
    ] as Check[] }; }
  };
  const metaConfigured = /^v\d+\.\d+$/.test(process.env.WHATSAPP_GRAPH_API_VERSION ?? "") && /^\d+$/.test(process.env.WHATSAPP_PHONE_NUMBER_ID ?? "") && Boolean(process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN);
  const [db, openai, whatsapp, sepa, providers] = await Promise.all([
    database(),
    authenticationCheck("OpenAI", `https://api.openai.com/v1/models/${encodeURIComponent(process.env.OPENAI_MODEL?.trim() ?? "")}`, process.env.OPENAI_API_KEY),
    metaConfigured ? authenticationCheck("WhatsApp config", `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}?fields=id`, process.env.WHATSAPP_ACCESS_TOKEN, true)
      : Promise.resolve<Check>({ name: "WhatsApp config", status: "ERROR", detail: "Configuración incompleta o inválida" }),
    sepaCheck(), providerChecks(),
  ]);
  checks.push(...db.checks, openai, whatsapp, sepa, ...providers);
  return { checkedAt: new Date().toISOString(), checks, data: db.summary, exitCode: checkExitCode(checks) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = await runDemoCheck();
    console.log(`Pre-check de solo lectura — ${result.checkedAt}`);
    for (const check of result.checks) console.log(`${check.name.padEnd(20)} ${check.status.padEnd(5)} ${check.detail}`);
    if (result.data) console.log(JSON.stringify({ data: result.data }, null, 2));
    console.log("No envía WhatsApp, no genera respuestas OpenAI, no actualiza precios ni cambia PostgreSQL. WARN externos no cambian el código de salida.");
    process.exitCode = result.exitCode;
  } catch { console.error("ERROR: pre-check incompleto; revisar configuración local sin publicar secretos."); process.exitCode = 1; }
  finally { await prisma.$disconnect(); }
}
