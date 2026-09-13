import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { realData } from "../prisma/real-data.js";
import { importRealData, validateRealData, type RealData } from "../prisma/seed-real.js";

// Datos sintéticos exclusivamente en memoria; nunca se conectan a PostgreSQL.
const fixture = (): RealData => ({
  products: [{ key: "p", brand: "Marca de test", name: "Producto de test", variant: null, size: "1 unidad", ean: null }],
  stores: [{ key: "s", chain: "Cadena de test", name: "Sucursal de test", address: "Dirección ficticia solo test", latitude: "0", longitude: "0" }],
  offers: [{ productKey: "p", storeKey: "s", price: "10.25", stock: true, source: "Fixture sintético de test", lastCheckedAt: "2026-01-01T10:00:00-03:00" }],
});

type Row = Record<string, unknown> & { id: number };
const harness = () => {
  const state = {
    products: [{ id: 1, brand: "Marca de test", name: "Producto de test", variant: null, size: "1 unidad", ean: null, aliases: ["alias existente"] }] as Row[],
    stores: [{ id: 1, chain: "Demo", name: "Sucursal Demo", address: "DEMO", latitude: "0", longitude: "0" }] as Row[],
    offers: [{ id: 1, productId: 1, storeId: 1, price: "99.00", stock: true, source: "DEMO" }] as Row[],
  };
  let transactions = 0;
  const matches = (row: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => key === "OR"
      ? (value as Record<string, unknown>[]).some((item) => matches(row, item))
      : key === "productId_storeId"
        ? matches(row, value as Record<string, unknown>) : row[key] === value);
  const db = {
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      transactions += 1;
      const draft = structuredClone(state);
      const delegate = (rows: Row[]) => ({
        findMany: async ({ where, take }: { where: Record<string, unknown>; take: number }) => rows.filter((r) => matches(r, where)).slice(0, take),
        count: async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where)).length,
        upsert: async ({ where, create, update }: { where: Record<string, unknown>; create: object; update: object }) => {
          const existing = rows.find((r) => matches(r, where));
          if (existing) return Object.assign(existing, update);
          const row = { ...create, id: Math.max(0, ...rows.map((r) => r.id)) + 1 };
          rows.push(row);
          return row;
        },
      });
      const result = await run({
        $queryRaw: async () => [{ locked: "" }],
        product: delegate(draft.products), store: delegate(draft.stores), offer: delegate(draft.offers),
      });
      Object.assign(state, draft);
      return result;
    },
  } as unknown as Pick<PrismaClient, "$transaction">;
  return { state, db, transactions: () => transactions };
};

test("seed-real rechaza placeholders antes de abrir una transacción", async () => {
  const h = harness();
  await assert.rejects(importRealData(h.db, realData), /completar/i);
  assert.equal(h.transactions(), 0);
});

test("seed-real admite disponibilidad desconocida y no reemplaza un precio más reciente", async () => {
  const h = harness();
  const data = fixture();
  data.offers[0]!.stock = null;
  data.offers[0]!.source = "REAL:SEPA";
  await importRealData(h.db, data);
  const saved = h.state.offers.find((o) => o.source === "REAL:SEPA")!;
  assert.equal(saved.stock, null);
  data.offers[0]!.price = "1.00";
  data.offers[0]!.lastCheckedAt = "2025-12-31T10:00:00-03:00";
  await importRealData(h.db, data);
  assert.equal(h.state.offers.find((o) => o.source === "REAL:SEPA")!.price, "10.25");
});

test("seed-real valida precio, coordenadas, stock, fecha, fuentes y referencias", () => {
  const invalid: Array<(data: RealData) => void> = [
    (d) => { d.offers[0]!.price = "-1"; },
    (d) => { d.offers[0]!.price = "1.234"; },
    (d) => { d.stores[0]!.latitude = "91"; },
    (d) => { d.stores[0]!.longitude = null; },
    (d) => { (d.offers[0] as { stock: unknown }).stock = "disponible"; },
    (d) => { d.offers[0]!.lastCheckedAt = "2026-01-01"; },
    (d) => { d.offers[0]!.source = "DEMO"; },
    (d) => { d.offers[0]!.productKey = "desconocido"; },
    (d) => { d.offers.push({ ...d.offers[0]! }); },
    (d) => { d.products.push({ ...d.products[0]! }); },
  ];
  for (const change of invalid) {
    const data = fixture();
    change(data);
    assert.throws(() => validateRealData(data));
  }
});

test("repetir seed-real actualiza ofertas sin duplicar y conserva los datos DEMO", async () => {
  const h = harness();
  const data = fixture();
  const demoBefore = structuredClone(h.state.offers[0]);
  const first = await importRealData(h.db, data);
  assert.equal(first.products.p, 1); // Reutiliza catálogo y aliases existentes.
  data.offers[0]!.price = "12.30";
  data.offers[0]!.stock = false;
  data.offers[0]!.lastCheckedAt = "2026-01-02T10:00:00-03:00";
  data.offers[0]!.source = "REAL: Segunda revisión sintética";
  data.stores[0]!.latitude = "1.000001";
  data.products[0]!.ean = "12345670"; // EAN sintético, solo memoria.
  const second = await importRealData(h.db, data);
  assert.deepEqual(first, second);
  assert.equal(h.state.products.length, 1);
  assert.equal(h.state.stores.length, 2);
  assert.equal(h.state.offers.length, 2);
  assert.deepEqual(h.state.offers[0], demoBefore);
  assert.deepEqual(h.state.products[0]!.aliases, ["alias existente"]);
  const real = h.state.offers.find((r) => r.source !== "DEMO")!;
  assert.equal(real.price, "12.30");
  assert.equal(real.stock, false);
  assert.equal(real.source, "REAL: Segunda revisión sintética");
  assert.equal((real.lastCheckedAt as Date).toISOString(), "2026-01-02T13:00:00.000Z");
  assert.equal(h.state.stores[1]!.latitude, "1.000001");
});

test("seed-real crea un producto sin EAN y reutiliza sus IDs en la segunda carga", async () => {
  const h = harness();
  const data = fixture();
  data.products[0]!.name = "Otro producto sintético";
  const first = await importRealData(h.db, data);
  const second = await importRealData(h.db, data);
  assert.deepEqual(first, second);
  assert.equal(h.state.products.length, 2);
  assert.equal(h.state.offers.length, 2);
});

test("seed-real incorpora un descubrimiento live al catálogo estable sin duplicarlo", async () => {
  const h = harness();
  h.state.products[0]!.liveOnly = true;
  await importRealData(h.db, fixture());
  assert.equal(h.state.products.length, 1);
  assert.equal(h.state.products[0]!.liveOnly, false);
  assert.deepEqual(h.state.products[0]!.aliases, ["alias existente"]);
});

test("seed-real permite corregir dirección mediante ID sin crear otra sucursal", async () => {
  const h = harness();
  const data = fixture();
  const first = await importRealData(h.db, data);
  data.stores[0]!.id = first.stores.s!;
  data.stores[0]!.address = "Dirección sintética corregida";
  assert.deepEqual(await importRealData(h.db, data), first);
  assert.equal(h.state.stores.length, 2);
});

test("seed-real revierte la carga si se intenta reutilizar una sucursal DEMO", async () => {
  const h = harness();
  const before = structuredClone(h.state);
  const data = fixture();
  data.products[0]!.name = "Producto nuevo solo test";
  data.stores[0]!.id = 1;
  await assert.rejects(importRealData(h.db, data), /contiene ofertas DEMO/);
  assert.deepEqual(h.state, before);
});

test("seed-real rechaza un EAN distinto o coincidencias ambiguas", async () => {
  const h = harness();
  h.state.products[0]!.ean = "12345670";
  const data = fixture();
  data.products[0]!.ean = "12345671";
  await assert.rejects(importRealData(h.db, data), /EAN difiere/);
  h.state.products.push({ ...h.state.products[0]!, id: 2 });
  await assert.rejects(importRealData(h.db, fixture()), /ambigua/);
});
