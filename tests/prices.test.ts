import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { readFile } from "node:fs/promises";
import { readPipeRows, readPipeRecords } from "../src/prices/csv.js";
import { productTargets, selectedTargets } from "../src/prices/config.js";
import { matchExactEan, matchDescription, normalizeProductText, presentationMatches } from "../src/prices/matching.js";
import { discoverSepaResource, parseSepaStore } from "../src/prices/providers/sepa.provider.js";
import { persistObservations } from "../src/prices/persist.js";
import type { PriceObservation } from "../src/prices/types.js";
import { parseCarrefour } from "../src/prices/providers/carrefour.provider.js";
import { parseVea } from "../src/prices/providers/vea.provider.js";
import { parseChangoMas } from "../src/prices/providers/changomas.provider.js";
import { matchesStoreContext } from "../src/prices/store-contexts.js";

test("SEPA parsea pipe CSV con BOM, comillas, saltos y chunks partidos", async () => {
  const content = '\uFEFFid_comercio|nombre\r\n10|"Sucursal | con ""comillas""\ny salto"\r\nÚltima actualización: ignorar\r\n';
  const bytes = Buffer.from(content);
  const rows = [];
  for await (const row of readPipeRecords(Readable.from(Array.from(bytes, (b) => Buffer.from([b]))), ["id_comercio", "nombre"])) rows.push(row);
  assert.deepEqual(rows, [{ id_comercio: "10", nombre: 'Sucursal | con "comillas"\ny salto' }]);
});

test("SEPA rechaza cambios de columnas y campos sin cerrar", async () => {
  await assert.rejects(async () => {
    for await (const _ of readPipeRecords(Readable.from(["otra|columna\n"]), ["id_comercio"])) {}
  }, /columnas/);
  await assert.rejects(async () => {
    for await (const _ of readPipeRows(Readable.from([Buffer.from('a|"sin cerrar')]))) {}
  }, /sin cerrar/);
});

test("SEPA descubre el ZIP por fecha publicada, no por día supuesto", () => {
  const html = '<div class="pkg-container"><a href="https://datos.produccion.gob.ar/old.zip">DESCARGAR</a><p>Precios SEPA Minoristas martes, 2026-09-01</p></div>' +
    '<div class="pkg-container"><a href="https://datos.produccion.gob.ar/new.zip">DESCARGAR</a><p>Precios SEPA Minoristas lunes, 2026-09-07</p></div>';
  assert.deepEqual(discoverSepaResource(html), { date: "2026-09-07", url: "https://datos.produccion.gob.ar/new.zip" });
});

test("matching usa EAN observado y rechaza una presentación contradictoria", () => {
  assert.equal(matchExactEan("7790895067556", "Coca-Cola Sin Azúcar 1,5 L", productTargets)?.key, "coca-zero-1500");
  assert.equal(matchExactEan("7790895067556", "Coca-Cola Sin Azúcar 2.25 L", productTargets), null);
  assert.equal(matchExactEan("7622201735296", "Oreo 354 g", productTargets), null);
  assert.equal(matchExactEan("7622201735296", "Oreo 3 x 118 g", productTargets), null);
  assert.equal(matchExactEan("desconocido", "Oreo 118 g", productTargets), null);
  assert.equal(presentationMatches("Oreo 0.118 kg", productTargets[1]!), true);
  assert.equal(normalizeProductText("Sin Azúcar 1,5 L"), "sin azucar 1.5 l");
  assert.equal(selectedTargets("coca zero")[0]?.key, "coca-zero-1500");
  assert.equal(selectedTargets("7790895067556")[0]?.key, "coca-zero-1500");
});

test("SEPA no inventa coordenadas para una sucursal web", () => {
  assert.equal(parseSepaStore({ sucursales_nombre: "Web", sucursales_latitud: "", sucursales_longitud: "" }, "Carrefour"), null);
});

const fixture = async (name: string) => JSON.parse((await readFile(new URL(`./fixtures/prices/${name}.json`, import.meta.url), "utf8")).replace(/^\uFEFF/, ""));

test("Carrefour: parsea fixture observada, sin sustituir Coca 2,25 por 1,5 L", async () => {
  const rows = parseCarrefour(await fixture("carrefour"));
  assert.equal(rows[0]?.price, "5900.00");
  assert.equal(rows[0]?.regularPrice, "5900.00");
  assert.equal(rows[0]?.ean, "7790895067570");
  assert.equal(rows[0]?.stock, true);
  assert.equal(matchExactEan(rows[0]!.ean!, rows[0]!.name, productTargets), null);
  assert.deepEqual(parseCarrefour({ data: { errors: [] } }), []);
});

test("Vea: precio unitario de JSON-LD, sin inventar EAN desde mpn/sku", async () => {
  const rows = parseVea(await fixture("vea"));
  assert.equal(rows[0]?.price, "5890.00"); // No $4417,50 condicionado a llevar dos.
  assert.equal(rows[0]?.ean, null);
  assert.equal(rows[0]?.sku, "18976");
  assert.equal(rows[0]?.stock, true);
  assert.equal(rows[0]?.regularPrice, null);
});

test("ChangoMás: parsea JSON-LD observado sin confundir vencimiento con actualización", async () => {
  const rows = parseChangoMas(await fixture("changomas"));
  assert.equal(rows[0]?.price, "5899.00");
  assert.equal(rows[0]?.ean, null);
  assert.equal(rows[0]?.stock, true);
  assert.ok(rows[0]?.url.startsWith("https://www.masonline.com.ar/"));
  assert.equal("lastCheckedAt" in rows[0]!, false);
});

test("sin EAN, marca y presentación estrictas permiten reconocer grupo sin asignar código", () => {
  assert.equal(matchDescription("Pepsi Black 1.5 L", "Pepsi", productTargets)?.key, "pepsi-black-1500");
  assert.equal(matchDescription("Pepsi Black 2.25 L", "Pepsi", productTargets), null);
  assert.equal(matchDescription("Oreo 118 g Chocolate", "Oreo", productTargets), null);
  assert.equal(matchDescription("Oreo Original 118 g", "Otra marca", productTargets), null);
  assert.equal(matchDescription("Playadito 1 kg", "Playadito", productTargets), null);
});

test("un contexto de entrega diferente o ambiguo nunca mapea una sucursal", () => {
  const mapping = { selector: "fixture", expectedText: "Sucursal fixture 123", evidence: "Solo test", store: {} as any };
  assert.equal(matchesStoreContext(["Sucursal fixture 123"], mapping), true);
  assert.equal(matchesStoreContext(["Otra sucursal"], mapping), false);
  assert.equal(matchesStoreContext(["Sucursal fixture 123", "Sucursal fixture 123"], mapping), false);
  assert.equal(matchesStoreContext([], mapping), false);
});

test("upsert conserva identidad, stock desconocido y la observación más reciente", async () => {
  // Todos los datos de sucursal/precio de este test son sintéticos.
  const products: any[] = [], stores: any[] = [], offers: any[] = [];
  const tx = {
    $queryRaw: async () => [],
    product: { upsert: async ({ where, create, update }: any) => {
      let p = products.find((p) => p.ean === where.ean);
      if (!p) { p = { id: products.length + 1, ...create }; products.push(p); }
      else Object.assign(p, update);
      return p;
    } },
    store: {
      findMany: async ({ where }: any) => stores.filter((s) => Object.entries(where).every(([k, v]) => s[k] === v)),
      upsert: async ({ where, create }: any) => {
        let s = stores.find((s) => s.id === where.id);
        if (!s) { s = { id: stores.length + 1, ...create }; stores.push(s); }
        return s;
      },
    },
    offer: {
      count: async () => 0,
      findMany: async () => offers,
      findUnique: async ({ where: { productId_storeId: key } }: any) => offers.find((o) => o.productId === key.productId && o.storeId === key.storeId) ?? null,
      upsert: async ({ create, update, where: { productId_storeId: key } }: any) => {
        const existing = offers.find((o) => o.productId === key.productId && o.storeId === key.storeId);
        if (existing) Object.assign(existing, update); else offers.push({ ...create });
      },
    },
  };
  const db = { $transaction: async (fn: any) => fn(tx) } as any;
  const observation: PriceObservation = {
    product: { key: "fixture", ean: "7790895067556", brand: "Fixture", name: "Fixture", variant: "Fixture", size: "1.5 L" },
    store: { externalKey: "fixture", chain: "Solo test", name: "Solo test", address: "Solo test", province: "AR-T", locality: "Solo test", latitude: "-26", longitude: "-65" },
    price: "123.45", stock: null, source: "REAL:SEPA", lastCheckedAt: new Date("2026-09-01T12:00:00Z"),
  };
  assert.equal(await persistObservations(db, [observation]), 1);
  products[0].liveOnly = true; // Descubierto online; SEPA debe habilitarlo también en OFF.
  assert.equal(await persistObservations(db, [observation]), 0);
  assert.equal(products[0].liveOnly, false);
  assert.equal(offers[0].stock, null);
  const newer = { ...observation, price: "120.00", stock: true, source: "REAL:PLAYWRIGHT:VEA", lastCheckedAt: new Date("2026-09-01T13:00:00Z") };
  assert.equal(await persistObservations(db, [newer]), 1);
  assert.equal(await persistObservations(db, [observation]), 0);
  assert.equal(await persistObservations(db, [{ ...newer, store: null }]), 0);
  // Refresh sin observaciones (p. ej. navegador bloqueado) conserva PostgreSQL.
  assert.equal(await persistObservations(db, []), 0);
  assert.equal(offers[0].source, "REAL:PLAYWRIGHT:VEA");
  assert.equal(offers[0].price, "120.00");
  assert.deepEqual([products.length, stores.length, offers.length], [1, 1, 1]);
  await assert.rejects(persistObservations(db, [{ ...newer, price: "0" }]), /inválida/);
});
