import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient, Prisma } from "@prisma/client";
import { realData } from "./real-data.js";
import { isNewerObservation } from "../src/prices/persist.js";

export type RealData = {
  products: Array<{
    key: string; id?: number; brand: string; name: string;
    variant: string | null; size: string | null; ean?: string | null;
  }>;
  stores: Array<{
    key: string; id?: number; chain: string; name: string; address: string;
    latitude: string | null; longitude: string | null;
  }>;
  offers: Array<{
    productKey: string; storeKey: string; price: string | null;
    stock: boolean | null; source: string; lastCheckedAt: string;
  }>;
};

export class RealDataError extends Error {}

const requiredText = (value: string, field: string): string => {
  if (typeof value !== "string" || !value.trim() || /COMPLETAR|PLACEHOLDER/i.test(value)) {
    throw new RealDataError(`${field}: completar el dato real antes de importar.`);
  }
  return value.trim();
};

const optionalText = (value: string | null | undefined, field: string) =>
  value == null ? null : requiredText(value, field);

const validateId = (id: number | undefined, field: string) => {
  if (id !== undefined && (!Number.isInteger(id) || id < 1 || id > 2147483647)) {
    throw new RealDataError(`${field}: debe ser el ID positivo de un registro existente.`);
  }
};

const unique = (values: string[], field: string) => {
  if (new Set(values).size !== values.length) throw new RealDataError(`${field}: hay duplicados.`);
};

const coordinate = (value: string | null, limit: number, field: string): string => {
  if (typeof value !== "string" || !/^-?\d{1,3}(\.\d{1,6})?$/.test(value) || Math.abs(Number(value)) > limit) {
    throw new RealDataError(`${field}: completar una coordenada decimal válida (hasta 6 decimales).`);
  }
  return value;
};

export const validateRealData = (input: RealData) => {
  if (!input.products.length || !input.stores.length || !input.offers.length) {
    throw new RealDataError("Completar al menos un producto, una sucursal y una oferta.");
  }
  const products = input.products.map((product) => {
    validateId(product.id, `Producto ${product.key}.id`);
    const ean = optionalText(product.ean, `Producto ${product.key}.ean`);
    if (ean !== null && !/^(\d{8}|\d{13})$/.test(ean)) {
      throw new RealDataError(`Producto ${product.key}: EAN debe tener 8 o 13 dígitos, o ser null.`);
    }
    return {
      ...product,
      key: requiredText(product.key, "product.key"),
      brand: requiredText(product.brand, `Producto ${product.key}.brand`),
      name: requiredText(product.name, `Producto ${product.key}.name`),
      variant: optionalText(product.variant, `Producto ${product.key}.variant`),
      size: optionalText(product.size, `Producto ${product.key}.size`),
      ean,
    };
  });
  const stores = input.stores.map((store) => {
    validateId(store.id, `Sucursal ${store.key}.id`);
    return {
      ...store,
      key: requiredText(store.key, "store.key"),
      chain: requiredText(store.chain, `Sucursal ${store.key}.chain`),
      name: requiredText(store.name, `Sucursal ${store.key}.name`),
      address: requiredText(store.address, `Sucursal ${store.key}.address`),
      latitude: coordinate(store.latitude, 90, `Sucursal ${store.key}.latitude`),
      longitude: coordinate(store.longitude, 180, `Sucursal ${store.key}.longitude`),
    };
  });
  unique(products.map((p) => p.key), "Claves de productos");
  unique(products.filter((p) => p.ean !== null).map((p) => p.ean!), "EAN");
  unique(products.filter((p) => p.id !== undefined).map((p) => String(p.id)), "IDs de productos");
  unique(products.map((p) => JSON.stringify([p.brand, p.name, p.variant, p.size])), "Identidades de productos");
  unique(stores.map((s) => s.key), "Claves de sucursales");
  unique(stores.filter((s) => s.id !== undefined).map((s) => String(s.id)), "IDs de sucursales");
  unique(stores.map((s) => JSON.stringify([s.chain, s.name, s.address])), "Identidades de sucursales");
  unique(input.offers.map((o) => JSON.stringify([o.productKey, o.storeKey])), "Ofertas producto/sucursal");
  const offers = input.offers.map((offer) => {
    if (!products.some((p) => p.key === offer.productKey) || !stores.some((s) => s.key === offer.storeKey)) {
      throw new RealDataError("Una oferta referencia una key de producto o sucursal inexistente.");
    }
    if (typeof offer.price !== "string" || !/^\d{1,10}(\.\d{1,2})?$/.test(offer.price) || Number(offer.price) <= 0) {
      throw new RealDataError(`Oferta ${offer.productKey}/${offer.storeKey}: completar un precio positivo, con punto y hasta 2 decimales.`);
    }
    if (offer.stock !== null && typeof offer.stock !== "boolean") throw new RealDataError("stock debe ser true, false o null (disponibilidad no confirmada).");
    const source = requiredText(offer.source, "offer.source");
    if (/\bDEMO\b/i.test(source)) throw new RealDataError("Una oferta real no puede tener fuente DEMO.");
    const dateText = requiredText(offer.lastCheckedAt, "offer.lastCheckedAt");
    const date = new Date(dateText);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(dateText) || !Number.isFinite(date.getTime())) {
      throw new RealDataError("lastCheckedAt: usar una fecha ISO con hora y zona horaria explícita.");
    }
    return { ...offer, price: offer.price, stock: offer.stock, source: source.startsWith("REAL:") ? source : `REAL: ${source}`, lastCheckedAt: date };
  });
  return { products, stores, offers };
};

export const importRealData = async (db: Pick<PrismaClient, "$transaction">, input: RealData) => {
  // Validar TODO antes de abrir una transacción o escribir cualquier registro.
  const data = validateRealData(input);
  return db.$transaction(async (tx) => {
    // Serializa ejecuciones de este importador: Store no tiene una clave natural única.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(731204)::text AS locked`;
    const productIds = new Map<string, number>();
    const storeIds = new Map<string, number>();
    for (const { key, id, ...product } of data.products) {
      const identity = { brand: product.brand, name: product.name, variant: product.variant, size: product.size };
      const matches = id !== undefined
        ? await tx.product.findMany({ where: { id }, take: 2 })
        : await tx.product.findMany({ where: { OR: [identity, ...(product.ean ? [{ ean: product.ean }] : [])] }, take: 2 });
      if (matches.length > 1 || (id !== undefined && matches.length === 0)) {
        throw new RealDataError(`Producto ${key}: coincidencia ambigua o ID inexistente; revisar el ID en real-data.ts.`);
      }
      if (id === undefined && matches[0]?.ean && product.ean && matches[0].ean !== product.ean) {
        throw new RealDataError(`Producto ${key}: el EAN difiere del registro existente; revisar antes de actualizar.`);
      }
      // -1 es solo un selector imposible para altas; el ID creado sigue siendo autoincremental.
      const saved = await tx.product.upsert({ where: { id: matches[0]?.id ?? -1 }, create: { ...product, liveOnly: false }, update: { ...product, liveOnly: false } });
      if ([...productIds.values()].includes(saved.id)) throw new RealDataError("Dos productos del archivo apuntan al mismo registro.");
      productIds.set(key, saved.id);
    }
    for (const { key, id, ...store } of data.stores) {
      const where = id !== undefined ? { id } : { chain: store.chain, name: store.name, address: store.address };
      const matches = await tx.store.findMany({ where, take: 2 });
      if (matches.length > 1 || (id !== undefined && matches.length === 0)) {
        throw new RealDataError(`Sucursal ${key}: coincidencia ambigua o ID inexistente; revisar el ID en real-data.ts.`);
      }
      if (matches[0] && (await tx.offer.count({ where: { storeId: matches[0].id, source: "DEMO" } })) > 0) {
        throw new RealDataError(`Sucursal ${key}: contiene ofertas DEMO; usar una sucursal real separada.`);
      }
      const saved = await tx.store.upsert({ where: { id: matches[0]?.id ?? -1 }, create: store, update: store });
      if ([...storeIds.values()].includes(saved.id)) throw new RealDataError("Dos sucursales del archivo apuntan al mismo registro.");
      storeIds.set(key, saved.id);
    }
    for (const { productKey, storeKey, ...offer } of data.offers) {
      const productId = productIds.get(productKey)!;
      const storeId = storeIds.get(storeKey)!;
      const record = { ...offer, productId, storeId };
      const previous = await tx.offer.findMany({ where: { productId, storeId }, select: { lastCheckedAt: true }, take: 1 });
      if (!isNewerObservation(offer.lastCheckedAt, previous[0]?.lastCheckedAt)) continue;
      await tx.offer.upsert({ where: { productId_storeId: { productId, storeId } }, create: record, update: record });
    }
    return { products: Object.fromEntries(productIds), stores: Object.fromEntries(storeIds), offers: data.offers.length };
  }, { maxWait: 10000, timeout: 30000 });
};

async function main() {
  validateRealData(realData);
  if (process.argv.includes("--check")) {
    console.log("Datos válidos. No se abrió conexión ni se escribió en PostgreSQL.");
    return;
  }
  const prisma = new PrismaClient();
  try {
    const result = await importRealData(prisma, realData);
    console.log("Carga real completada (sin borrar datos DEMO):", result);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    // Los errores de conexión de Prisma pueden contener URLs; no imprimirlos completos.
    console.error(error instanceof RealDataError ? error.message : "No se pudo importar. Se revirtió la transacción; revisar conexión, EAN únicos e IDs.");
    if (error instanceof Prisma.PrismaClientKnownRequestError) console.error("Código Prisma:", error.code);
    process.exitCode = 1;
  });
}
