import type { PrismaClient } from "@prisma/client";
import type { PriceObservation } from "./types.js";

export const isNewerObservation = (incoming: Date, existing?: Date) =>
  Number.isFinite(incoming.getTime()) && (!existing || incoming.getTime() > existing.getTime());

// Una transacción por refresh: fallos de escritura no dejan una importación parcial.
// El mismo lock del importador manual protege la identidad natural de Store.
export async function persistObservations(db: Pick<PrismaClient, "$transaction">, observations: PriceObservation[]) {
  const mapped = observations.filter((o) => o.store !== null);
  for (const o of mapped) {
    const s = o.store!;
    if (!o.source.startsWith("REAL:") || !/^\d{8,14}$/.test(o.product.ean) ||
        !/^\d{1,10}(\.\d{1,2})?$/.test(o.price) || Number(o.price) <= 0 ||
        !Number.isFinite(o.lastCheckedAt.getTime()) || o.lastCheckedAt.getTime() > Date.now() + 300000 ||
        ![true, false, null].includes(o.stock) ||
        !s.chain.trim() || !s.name.trim() || !s.address.trim() ||
        !s.latitude.trim() || !s.longitude.trim() ||
        !Number.isFinite(Number(s.latitude)) || Math.abs(Number(s.latitude)) > 90 ||
        !Number.isFinite(Number(s.longitude)) || Math.abs(Number(s.longitude)) > 180 ||
        (Number(s.latitude) === 0 && Number(s.longitude) === 0)) {
      throw new Error("Observación inválida: no se escribió el refresh.");
    }
  }
  if (!mapped.length) return 0;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(731204)::text AS locked`;
    const products = new Map<string, number>();
    const stores = new Map<string, number>();
    let updated = 0;
    for (const observation of mapped) {
      const { product: p, store: s, price, stock, source, lastCheckedAt } = observation;
      let productId = products.get(p.ean);
      if (productId === undefined) {
        const product = { ean: p.ean, brand: p.brand, name: p.name, variant: p.variant, size: p.size };
        productId = (await tx.product.upsert({ where: { ean: p.ean }, create: product, update: product })).id;
        products.set(p.ean, productId);
      }
      const identity = { chain: s!.chain, name: s!.name, address: s!.address };
      const key = JSON.stringify(identity);
      let storeId = stores.get(key);
      if (storeId === undefined) {
        const matches = await tx.store.findMany({ where: identity, take: 2 });
        if (matches.length > 1) throw new Error("Sucursal ambigua: revisar mapping antes de importar.");
        if (matches[0] && await tx.offer.count({ where: { storeId: matches[0].id, source: "DEMO" } })) {
          throw new Error("El mapping apunta a una sucursal DEMO; no se modificó.");
        }
        const record = { ...identity, latitude: s!.latitude, longitude: s!.longitude };
        storeId = (await tx.store.upsert({ where: { id: matches[0]?.id ?? -1 }, create: record, update: record })).id;
        stores.set(key, storeId);
      }
      const where = { productId_storeId: { productId, storeId } };
      const previous = await tx.offer.findUnique({ where, select: { lastCheckedAt: true } });
      if (!isNewerObservation(lastCheckedAt, previous?.lastCheckedAt)) continue;
      const record = { productId, storeId, price, stock, source, lastCheckedAt };
      await tx.offer.upsert({ where, create: record, update: record });
      updated++;
    }
    return updated;
  }, { maxWait: 10000, timeout: 120000 });
}
