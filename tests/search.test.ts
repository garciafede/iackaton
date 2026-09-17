import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";

import { parseSearchQuery, searchRoutes } from "../src/routes/search.js";
import { prisma } from "../src/lib/prisma.js";
import {
  findBestProduct,
  sortSearchResults,
  searchProductOffers,
  type SearchResult,
  type SearchableProduct,
} from "../src/services/product-search.service.js";
import { calculateDistanceKm } from "../src/utils/distance.js";
import { normalizeSearchText } from "../src/utils/normalize-text.js";

const products: SearchableProduct[] = [
  {
    id: 1,
    brand: "Coca-Cola",
    name: "Coca-Cola Sin Azúcar",
    variant: "Zero",
    size: "1.5 L",
    aliases: [{ alias: "coca zero" }, { alias: "cocacola zero" }],
  },
  {
    id: 2,
    brand: "Oreo",
    name: "Galletitas Oreo",
    variant: "Original",
    size: "118 g",
    aliases: [{ alias: "oreo original" }],
  },
];

const result = (price: number, distanceKm: number): SearchResult => ({
  store: { id: price, chain: "Demo", name: "Comercio Demo", address: "DEMO" },
  price,
  distanceKm,
  stock: true,
  source: "DEMO",
  lastCheckedAt: new Date("2026-01-01T00:00:00.000Z"),
});

for(const [query,brand,name,small,large] of [['Pepsi','Pepsi','Pepsi','1.5 L','2 L'],['Coca','Coca-Cola','Coca-Cola','354 ml','1.5 L'],['Arroz Lucchetti','Lucchetti','Arroz Lucchetti','500 g','1 kg']]){
  test(`E2E sin presentación: ${query} compara variantes reales por precio/distancia`,async t=>{
    const variants=[{id:31,brand:brand!,name:name!,variant:'Original',size:large!,aliases:[]},{id:32,brand:brand!,name:name!,variant:'Original',size:small!,aliases:[]}];
    const originalProduct=prisma.product.findMany,originalOffer=prisma.offer.findMany;
    t.after(()=>{Object.assign(prisma.product,{findMany:originalProduct});Object.assign(prisma.offer,{findMany:originalOffer});});
    Object.assign(prisma.product,{findMany:async()=>variants});
    Object.assign(prisma.offer,{findMany:async(args:any)=>{
      assert.deepEqual(args.where.source,{startsWith:'REAL:'});assert.deepEqual(args.where.productId.in,[31,32]);
      return variants.map((p,index)=>({productId:p.id,price:index?150:100,stock:null,source:'REAL:SEPA',lastCheckedAt:new Date(),store:{id:index+1,chain:'Vea',name:'Fixture',address:'Fixture',latitude:index?0.001:0.02,longitude:0}}));
    }});
    const cheap=await searchProductOffers(query!,0,0,'price'),near=await searchProductOffers(query!,0,0,'distance');
    assert.equal(cheap?.product.size,large);assert.equal(cheap?.results[0]?.product?.size,large);
    assert.equal(near?.product.size,small);assert.equal(near?.results[0]?.product?.size,small);
    assert.equal(cheap?.results.length,2);assert.equal(near?.results.length,2);
  });
}

test('E2E Coca Zero 2L: alias sin EAN no puede sustituir 1.5L; 3L ausente devuelve null',()=>{
  for(const query of ['Coca Zero 2L','Y coca zero 2l?','coca zero 3L'])assert.equal(findBestProduct(query,products),null,query);
  assert.equal(findBestProduct('coca zero 1,5L',products)?.id,1);
  const exact={...products[0]!,id:20,size:'2 L'};
  assert.equal(findBestProduct('coca zero 2L',[...products,exact])?.id,20);
});

for(const environment of ['production','development']){
  test(`E2E ${environment}: sin ofertas reales no hay fallback DEMO`,async t=>{
    const prior=process.env.NODE_ENV;process.env.NODE_ENV=environment;
    t.after(()=>{if(prior===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=prior;});
    const originalProduct=prisma.product.findMany,originalOffer=prisma.offer.findMany;
    t.after(()=>{Object.assign(prisma.product,{findMany:originalProduct});Object.assign(prisma.offer,{findMany:originalOffer});});
    Object.assign(prisma.product,{findMany:async()=>products});
    const queries:any[]=[];
    Object.assign(prisma.offer,{findMany:async(args:any)=>{
      queries.push(args.where);assert.deepEqual(args.where.source,{startsWith:'REAL:'});return [];
    }});
    assert.equal(await searchProductOffers('coca zero 2L',0,0,'price'),null);
    assert.equal(queries.length,0);
    const absent=await searchProductOffers('coca zero 1,5L',0,0,'price');
    assert.equal(absent?.totalResults,0);assert.equal(queries.length,1);
  });
}

test("prioriza EAN reales, agrupa empaques y nunca mezcla DEMO en la misma búsqueda", async (t) => {
  const originalProductFindMany = prisma.product.findMany, originalOfferFindMany = prisma.offer.findMany;
  t.after(() => { Object.assign(prisma.product, { findMany: originalProductFindMany }); Object.assign(prisma.offer, { findMany: originalOfferFindMany }); });
  const realProducts = [
    { ...products[0]!, id: 10, ean: "7790070431417", brand: "Gallo", name: "Arroz Gallo Oro", variant: "Parboil, bolsa", size: "1 kg", aliases: [] },
    { ...products[0]!, id: 11, ean: "7790070433091", brand: "Gallo", name: "Arroz Gallo Oro", variant: "Parboil, caja", size: "1 kg", aliases: [] },
  ];
  Object.assign(prisma.product, { findMany: async () => [...products, ...realProducts] });
  const queries: any[] = [];
  Object.assign(prisma.offer, { findMany: async (args: any) => {
    queries.push(args.where);
    return [{ productId: 10, price: "100.00", stock: null, source: "REAL:SEPA", lastCheckedAt: new Date(), store: { id: 1, chain: "Fixture", name: "Fixture", address: "Fixture", latitude: 0, longitude: 0 } }];
  } });
  const found = await searchProductOffers("gallo oro", 0, 0, "price");
  assert.deepEqual(queries[0].productId, { in: [10, 11] });
  assert.deepEqual(queries[0].source, { startsWith: "REAL:" });
  assert.equal(queries.length, 1);
  assert.equal(found?.results[0]?.stock, null);
  await searchProductOffers("7790070433091", 0, 0, "price");
  assert.deepEqual(queries[1].productId, { in: [11] });
  assert.equal(await searchProductOffers("gallo oro 500 g", 0, 0, "price"), null);
});

test("normaliza mayúsculas, acentos, guiones y espacios", () => {
  assert.equal(normalizeSearchText("  COCA---Cola   Sin Azúcar "), "coca cola sin azucar");
  assert.equal(normalizeSearchText("Coca   Zero"), "coca zero");
});

test("calcula distancia con Haversine", () => {
  const distance = calculateDistanceKm(
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 0 },
  );
  assert.ok(Math.abs(distance - 111.2) < 0.1);
});

test("encuentra un producto por alias", () => {
  assert.equal(findBestProduct("COCA ZERO", products)?.id, 1);
});

test("encuentra un producto por nombre", () => {
  assert.equal(findBestProduct("Galletitas Oreo", products)?.id, 2);
});

test("devuelve null para una búsqueda inexistente", () => {
  assert.equal(findBestProduct("producto que no existe", products), null);
});

test("ordena resultados por distancia", () => {
  const sorted = sortSearchResults([result(100, 8), result(200, 2)], "distance");
  assert.deepEqual(sorted.map(({ distanceKm }) => distanceKm), [2, 8]);
});

test("ordena resultados por precio", () => {
  const sorted = sortSearchResults([result(300, 1), result(100, 9)], "price");
  assert.deepEqual(sorted.map(({ price }) => price), [100, 300]);
});

test("rechaza coordenadas fuera de rango", () => {
  assert.deepEqual(
    parseSearchQuery({ q: "coca", lat: "-91", lng: "-65.22" }),
    { error: "lat debe ser un número entre -90 y 90" },
  );
  assert.deepEqual(
    parseSearchQuery({ q: "coca", lat: "-26.82", lng: "181" }),
    { error: "lng debe ser un número entre -180 y 180" },
  );
});

test("GET /search conserva fuente real, precio y fecha sin cambiar su contrato", async (t) => {
  // La ruta y el servicio son reales; solo se simula PostgreSQL.
  const originalProductFindMany = prisma.product.findMany;
  const originalOfferFindMany = prisma.offer.findMany;
  t.after(() => {
    Object.assign(prisma.product, { findMany: originalProductFindMany });
    Object.assign(prisma.offer, { findMany: originalOfferFindMany });
  });
  Object.assign(prisma.product, { findMany: async () => products });
  Object.assign(prisma.offer, { findMany: async (args: { where: unknown }) => {
    assert.deepEqual((args.where as { productId: unknown }).productId, { in: [1] });
    assert.deepEqual((args.where as { OR: unknown }).OR, [{ stock: true }, { stock: null }]);
    return [{
      price: "10.25", stock: null, source: "REAL: Fixture sintético de test",
      lastCheckedAt: new Date("2026-01-01T13:00:00.000Z"),
      store: { id: 2, chain: "Cadena de test", name: "Sucursal de test", address: "Dirección ficticia solo test", latitude: "0", longitude: "0" },
    }];
  } });
  const app = Fastify({ logger: false });
  t.after(() => app.close());
  await app.register(searchRoutes);
  const response = await app.inject({ method: "GET", url: "/search?q=coca%20zero&lat=0&lng=0&sort=price" });
  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.totalResults, 1);
  assert.equal(payload.results[0].price, 10.25);
  assert.equal(payload.results[0].stock, null);
  assert.equal(payload.results[0].availability, "disponibilidad no confirmada");
  assert.equal(payload.results[0].distanceKm, 0);
  assert.equal(payload.results[0].source, "REAL: Fixture sintético de test");
  assert.equal(payload.results[0].lastCheckedAt, "2026-01-01T13:00:00.000Z");
});
