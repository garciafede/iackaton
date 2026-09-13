import { mkdir, mkdtemp, rename, stat, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { priceConfig, selectedTargets, eanVariants } from "../config.js";
import { readPipeRecords } from "../csv.js";
import { presentationMatches } from "../matching.js";
import { copyZipEntry, listZipEntries, openZipEntry } from "../zip.js";
import type { PriceObservation, PriceProvider, RefreshOptions, RefreshResult } from "../types.js";

export function discoverSepaResource(html: string) {
  const resources = html.split('<div class="pkg-container">').flatMap((block) => {
    const url = block.match(/href="(https:\/\/datos\.produccion\.gob\.ar\/[^"\s]+\.zip)"/)?.[1];
    const date = block.match(/Precios SEPA Minoristas[^<]*?(\d{4}-\d{2}-\d{2})/)?.[1];
    return url && date ? [{ url, date }] : [];
  }).sort((a, b) => b.date.localeCompare(a.date));
  if (!resources[0]) throw new Error("SEPA: no se encontró un ZIP minorista con fecha; revisar el catálogo oficial.");
  return resources[0];
}

async function latestZip() {
  const response = await fetch(priceConfig.sepaCatalogUrl, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`SEPA: catálogo HTTP ${response.status}.`);
  const resource = discoverSepaResource(await response.text());
  const file = join(priceConfig.cacheDirectory, `sepa-${resource.date}.zip`);
  await mkdir(priceConfig.cacheDirectory, { recursive: true });
  if ((await stat(file).catch(() => null))?.size) return file;
  const zip = await fetch(resource.url, { signal: AbortSignal.timeout(120000) });
  if (!zip.ok || !zip.body) throw new Error(`SEPA: descarga HTTP ${zip.status}.`);
  let bytes = 0;
  const cap = new Transform({ transform(chunk: Buffer, _encoding, done) {
    bytes += chunk.length;
    done(bytes > 600 * 1024 * 1024 ? new Error("SEPA: descarga supera el límite de 600 MB.") : null, chunk);
  } });
  const partial = file + ".partial";
  try {
    await pipeline(Readable.fromWeb(zip.body as never), cap, createWriteStream(partial));
    await listZipEntries(partial);
    await rename(partial, file);
  } catch (error) { await rm(partial, { force: true }); throw error; }
  return file;
}

export function parseSepaStore(row: Record<string, string>, chain: string): PriceObservation["store"] {
  const latitude = Number(row.sucursales_latitud);
  const longitude = Number(row.sucursales_longitud);
  if (!row.sucursales_latitud || !row.sucursales_longitud || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || (latitude === 0 && longitude === 0)) return null;
  const address = [row.sucursales_calle, row.sucursales_numero, row.sucursales_localidad, row.sucursales_provincia].filter(Boolean).join(", ");
  if (!row.sucursales_calle || !row.sucursales_nombre || !row.sucursales_localidad) return null;
  return {
    externalKey: [row.id_comercio, row.id_bandera, row.id_sucursal].join(":"), chain,
    name: `${chain} ${row.sucursales_nombre}`, address,
    province: row.sucursales_provincia!, locality: row.sucursales_localidad,
    latitude: latitude.toFixed(6), longitude: longitude.toFixed(6),
  };
}

export class SepaPriceProvider implements PriceProvider {
  readonly name = "SEPA";
  async refresh(options: RefreshOptions = {}): Promise<RefreshResult> {
    const started = Date.now();
    const targets = selectedTargets(options.product, options);
    const result: RefreshResult = { provider: this.name, productsSearched: targets.map((p) => p.key), productsFound: [], productsNotFound: [], offersUpdated: 0, unmapped: 0, unmatched: 0, errors: [], durationMs: 0, observations: [] };
    const seen = new Set<string>();
    const eans = new Map(targets.flatMap((p) => p.eans.map((ean) => [ean, p] as const)));
    let tempDirectory: string | undefined;
    try {
      const file = options.file ?? await latestZip();
      const outer = await listZipEntries(file);
      await mkdir(priceConfig.cacheDirectory, { recursive: true });
      tempDirectory = await mkdtemp(join(priceConfig.cacheDirectory, "extract-"));
      for (const chain of priceConfig.chains) {
        const entry = outer.find((e) => e.name.includes(`comercio-sepa-${chain.commerceId}_`) && e.name.endsWith(".zip") && e.size > 0);
        if (!entry) { result.errors.push(`${chain.name}: no hay paquete publicado.`); continue; }
        const innerFile = join(tempDirectory, `${chain.key}.zip`);
        await copyZipEntry(file, entry, innerFile);
        const inner = await listZipEntries(innerFile);
        const commerceFile = inner.find((e) => e.name === "comercio.csv");
        const storesFile = inner.find((e) => e.name === "sucursales.csv");
        const productsFile = inner.find((e) => e.name === "productos.csv");
        if (!commerceFile || !storesFile || !productsFile) { result.errors.push(`${chain.name}: faltan CSV requeridos.`); continue; }
        const dates = new Map<string, Date>();
        for await (const row of readPipeRecords(await openZipEntry(innerFile, commerceFile), ["id_comercio", "id_bandera", "comercio_ultima_actualizacion"])) {
          if (row.id_comercio !== chain.commerceId || !chain.flags.includes(row.id_bandera!)) continue;
          const date = new Date(row.comercio_ultima_actualizacion!);
          const age = (Date.now() - date.getTime()) / 86400000;
          if (!Number.isFinite(age) || age < -1 || age > priceConfig.maxSourceAgeDays) {
            result.errors.push(`${chain.name}, bandera ${row.id_bandera}: fecha declarada inválida o antigua (${row.comercio_ultima_actualizacion}); no se reemplaza por la fecha de descarga.`);
          } else dates.set(row.id_bandera!, date);
        }
        const stores = new Map<string, NonNullable<PriceObservation["store"]>>();
        const buckets = new Map<string, NonNullable<PriceObservation["store"]>[]>();
        for await (const row of readPipeRecords(await openZipEntry(innerFile, storesFile), ["id_comercio", "id_bandera", "id_sucursal", "sucursales_nombre", "sucursales_calle", "sucursales_numero", "sucursales_provincia", "sucursales_localidad", "sucursales_latitud", "sucursales_longitud"])) {
          if (row.id_comercio !== chain.commerceId || !chain.flags.includes(row.id_bandera!) || !priceConfig.provinces.includes(row.sucursales_provincia!)) continue;
          const store = parseSepaStore(row, chain.name);
          if (!store) { result.unmapped += 1; continue; }
          const bucket = buckets.get(store.province) ?? [];
          bucket.push(store); buckets.set(store.province, bucket);
        }
        for (const province of priceConfig.provinces) {
          const bucket = (buckets.get(province) ?? []).sort((a, b) => a.externalKey.localeCompare(b.externalKey, undefined, { numeric: true }));
          for (const store of bucket.slice(0, priceConfig.maxStoresPerChainProvince)) stores.set(store.externalKey, store);
        }
        // Leer productos aun con timestamps antiguos permite reportar qué EAN existen.
        for await (const row of readPipeRecords(await openZipEntry(innerFile, productsFile), ["id_comercio", "id_bandera", "id_sucursal", "id_producto", "productos_ean", "productos_descripcion", "productos_precio_lista"])) {
          const target = row.productos_ean === "1" ? eans.get(row.id_producto!) : undefined;
          if (!target || row.id_comercio !== chain.commerceId || !chain.flags.includes(row.id_bandera!)) continue;
          if (!presentationMatches(row.productos_descripcion ?? "", target)) { result.unmatched += 1; continue; }
          const store = stores.get([row.id_comercio, row.id_bandera, row.id_sucursal].join(":"));
          if (!store) continue;
          seen.add(target.key);
          const date = dates.get(row.id_bandera!);
          if (!date) continue;
          const price = row.productos_precio_lista!;
          if (!/^\d{1,10}(\.\d{1,2})?$/.test(price) || Number(price) <= 0) { result.unmatched += 1; continue; }
          if (!row.productos_descripcion || row.productos_descripcion.includes("\uFFFD")) { result.unmatched += 1; continue; }
          result.observations.push({
            product: { key: target.key, ean: row.id_producto!, brand: target.brand, name: target.name, variant: eanVariants[row.id_producto!] ?? target.variant, size: target.size, category: target.category },
            store, price, stock: null, source: "REAL:SEPA", lastCheckedAt: date,
          });
        }
        await rm(innerFile, { force: true });
      }
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : "Error SEPA desconocido.");
    } finally {
      if (tempDirectory) {
        const cacheRoot = resolve(priceConfig.cacheDirectory);
        const target = resolve(tempDirectory);
        if (target.startsWith(cacheRoot + "/") || target.startsWith(cacheRoot + "\\")) await rm(target, { recursive: true, force: true });
      }
      result.productsFound = [...seen];
      result.productsNotFound = targets.filter((p) => !seen.has(p.key)).map((p) => p.key);
      result.durationMs = Date.now() - started;
    }
    return result;
  }
}
