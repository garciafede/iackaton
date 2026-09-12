import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import { addRecommendations, assessOfferQuality, classifyFreshness, filterByRadius, offerQualityConfig, resolveRadiusKm } from "../src/services/offer-quality.js";
import { searchProductOffers, sortSearchResults } from "../src/services/product-search.service.js";
import { parseSearchQuery, searchRoutes } from "../src/routes/search.js";
import { resolveMessageRadius } from "../src/ai/search-preferences.js";
import { prisma } from "../src/lib/prisma.js";

const now = new Date("2026-09-09T12:00:00Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3600000);
const quality = (hours: number, stock: boolean | null = true, source = "REAL:SEPA", storeIdentified = true) =>
  assessOfferQuality({ lastCheckedAt: hoursAgo(hours), stock, source, storeIdentified }, now);

test("radio: 25 km por defecto, borde inclusivo, sin redondear y null sin límite", () => {
  const offers = [0, 5, 25, 25.004, 500, Infinity, NaN].map((distanceKm) => ({ distanceKm }));
  assert.deepEqual(filterByRadius(offers).map((o) => o.distanceKm), [0, 5, 25]);
  assert.deepEqual(filterByRadius(offers, 5).map((o) => o.distanceKm), [0, 5]);
  assert.equal(filterByRadius(offers, null).length, 5);
  assert.equal(offers.length, 7);
  for (const radius of [0, -1, NaN, Infinity, offerQualityConfig.maxRadiusKm + 1, "5"]) assert.throws(() => resolveRadiusKm(radius));
});

test("/search acepta radio explícito, unlimited y recommended; rechaza radios inválidos", () => {
  const input = { q: "coca zero", lat: "0", lng: "0" };
  const defaultQuery = parseSearchQuery(input);
  assert.ok("value" in defaultQuery);
  assert.equal(defaultQuery.value.radiusKm, 25);
  assert.equal(defaultQuery.value.sort, "distance");
  for (const [radiusKm, expected] of [["5", 5], ["0.5", 0.5], ["unlimited", null], ["null", null]] as const) {
    const parsed = parseSearchQuery({ ...input, radiusKm, sort: "recommended" });
    assert.ok("value" in parsed);
    assert.equal(parsed.value.radiusKm, expected);
    assert.equal(parsed.value.sort, "recommended");
  }
  for (const radiusKm of ["", " ", "abc", "-1", "0", "Infinity", "20001"]) assert.ok("error" in parseSearchQuery({ ...input, radiusKm }));
  assert.ok("error" in parseSearchQuery({ ...input, sort: "random" }));
});

test("preferencias: cerca, radio numérico y distancia irrestricta; null omitido no elimina el radio", () => {
  assert.equal(resolveMessageRadius("Buscame Coca Zero cerca", null), 25);
  assert.equal(resolveMessageRadius("a menos de 5 km", 25), 5);
  assert.equal(resolveMessageRadius("Oreo a menos de 2,5 kilómetros"), 2.5);
  assert.equal(resolveMessageRadius("Coca Zero cerca mío"), 25);
  assert.equal(resolveMessageRadius("no importa la distancia, quiero el más barato"), null);
  assert.equal(resolveMessageRadius("quiero el más barato sin importar distancia"), null);
  assert.equal(resolveMessageRadius("Buscame Coca Zero", null), 25);
  assert.throws(() => resolveMessageRadius("en un radio de 0 km"));
});

test("frescura: límites de 12/48 horas, antigüedad relativa y fecha inválida/futura", () => {
  assert.equal(classifyFreshness(hoursAgo(11.999), now).freshness, "FRESH");
  assert.equal(classifyFreshness(hoursAgo(12), now).freshness, "STALE");
  assert.equal(classifyFreshness(hoursAgo(48), now).freshness, "STALE");
  assert.equal(classifyFreshness(hoursAgo(48.001), now).freshness, "VERY_STALE");
  assert.match(classifyFreshness(hoursAgo(3), now).freshnessLabel, /hace 3 horas/);
  assert.match(classifyFreshness(hoursAgo(49), now).freshnessLabel, /Conviene confirmar/);
  assert.match(classifyFreshness(hoursAgo(0), now).freshnessLabel, /menos de un minuto/);
  for (const date of [hoursAgo(-1), new Date(NaN)]) {
    const invalid = classifyFreshness(date, now);
    assert.equal(invalid.freshness, "VERY_STALE");
    assert.equal(invalid.ageHours, null);
  }
});

test("confianza determinística: fuente, fecha, identificación de sucursal y stock", () => {
  assert.equal(quality(1, true, "REAL:PLAYWRIGHT:CARREFOUR").confidence, "HIGH");
  assert.equal(quality(1, true).confidence, "HIGH");
  assert.equal(quality(1, null).confidence, "MEDIUM");
  assert.equal(quality(24, true).confidence, "MEDIUM");
  for (const q of [quality(49), quality(1, true, "DEMO"), quality(1, true, "REAL:Manual"), quality(1, true, "REAL:SEPA", false), quality(1, false)]) assert.equal(q.confidence, "LOW");
  assert.ok(quality(1, null).confidenceReasons.includes("Disponibilidad no confirmada"));
});

const rankedOffer = (id: number, price: number, distanceKm: number, hours = 1, stock: boolean | null = true) => ({
  store: { id, chain: "Fixture", name: "Fixture", address: "Fixture" }, price, distanceKm, stock,
  source: "REAL:SEPA", lastCheckedAt: hoursAgo(hours), quality: quality(hours, stock),
});

test("recommended explica $200 adicionales por una opción 8 km más cercana", () => {
  const input = [rankedOffer(1, 1000, 10), rankedOffer(2, 1200, 2)];
  const scores = addRecommendations(input);
  const sorted = sortSearchResults(scores, "recommended");
  assert.equal(sorted[0]?.store.id, 2);
  assert.deepEqual(sorted[0]?.recommendation?.comparisonToCheapest, { storeId: 1, productId: null, priceDifference: 200, distanceSavedKm: 8 });
  assert.equal(sortSearchResults(scores, "price")[0]?.store.id, 1);
  assert.equal(sortSearchResults(scores, "distance")[0]?.store.id, 2);
  assert.equal("recommendation" in input[0]!, false);
  for (const result of scores) assert.ok(result.recommendation.score >= 0 && result.recommendation.score <= 100);
});

test("recommended favorece frescura y stock confirmado, con desempate estable", () => {
  const sorted = sortSearchResults(addRecommendations([
    rankedOffer(3, 1000, 2, 49), rankedOffer(2, 1000, 2, 1, null), rankedOffer(1, 1000, 2, 1),
  ]), "recommended");
  assert.deepEqual(sorted.map((o) => o.store.id), [1, 2, 3]);
  assert.deepEqual(sortSearchResults(addRecommendations([rankedOffer(2, 1000, 2), rankedOffer(1, 1000, 2)]), "recommended").map((o) => o.store.id), [1, 2]);
  assert.throws(() => addRecommendations([rankedOffer(1, 0, 2)]));
});

// Fixtures sintéticas en memoria. No se escribe ni se conecta a PostgreSQL.
function mockDatabase(t: TestContext) {
  const originalProduct = prisma.product.findMany, originalOffer = prisma.offer.findMany;
  t.after(() => { Object.assign(prisma.product, { findMany: originalProduct }); Object.assign(prisma.offer, { findMany: originalOffer }); });
  const products = [{ id: 10, ean: "7790895067556", brand: "Coca-Cola", name: "Coca-Cola Sin Azúcar", variant: "Sin Azúcar", size: "1.5 L", aliases: [{ alias: "coca zero" }] }];
  const makeOffer = (id: number, price: string, lat: number) => ({
    productId: 10, price, stock: null, source: "REAL:SEPA", lastCheckedAt: new Date(),
    store: { id, chain: "Fixture", name: `Fixture ${id}`, address: "Solo test", latitude: lat, longitude: 0 },
  });
  const state = { offers: [makeOffer(1, "1000.00", 1), makeOffer(2, "1200.00", 0.1), makeOffer(3, "1300.00", 0.2)], queries: [] as unknown[] };
  Object.assign(prisma.product, { findMany: async () => products });
  Object.assign(prisma.offer, { findMany: async (args: { where: unknown }) => { state.queries.push(args.where); return state.offers; } });
  return state;
}

test("servicio filtra antes de ordenar: barato lejano excluido, unlimited lo incluye", async (t) => {
  mockDatabase(t);
  const local = await searchProductOffers("coca zero", 0, 0, "price");
  assert.equal(local?.radiusKm, 25);
  assert.equal(local?.totalResults, 2);
  assert.equal(local?.results[0]?.store.id, 2);
  assert.equal(local?.outsideRadiusCount, 1);
  assert.equal(local?.results[0]?.quality?.confidence, "MEDIUM");
  const all = await searchProductOffers("coca zero", 0, 0, "price", null);
  assert.equal(all?.totalResults, 3);
  assert.equal(all?.results[0]?.store.id, 1);
});

test("radio vacío ofrece ampliación, sin devolver resultados lejanos ni DEMO", async (t) => {
  const state = mockDatabase(t);
  const empty = await searchProductOffers("coca zero", 0, 0, "recommended", 5);
  assert.equal(empty?.status, "NO_OFFERS_WITHIN_RADIUS");
  assert.equal(empty?.totalResults, 0);
  assert.equal(empty?.canExpandRadius, true);
  assert.equal(empty?.suggestedRadiusKm, 25);
  assert.equal(state.queries.length, 1);
  const expanded = await searchProductOffers("coca zero", 0, 0, "recommended", empty!.suggestedRadiusKm);
  assert.equal(expanded?.totalResults, 2);
});

test("precio faltante/inválido y coordenadas inválidas no generan ofertas ni ranking", async (t) => {
  const state = mockDatabase(t);
  state.offers[0]!.price = "";
  state.offers[1]!.price = "NaN";
  state.offers[2]!.store.latitude = 91;
  const empty = await searchProductOffers("coca zero", 0, 0, "recommended");
  assert.equal(empty?.status, "NO_ELIGIBLE_OFFERS");
  assert.equal(empty?.totalResults, 0);
  assert.equal(empty?.canExpandRadius, false);
});

test("ruta real /search expone calidad/ranking y valida radius sin depender de Internet", async (t) => {
  mockDatabase(t);
  const app = Fastify({ logger: false });
  t.after(() => app.close());
  await app.register(searchRoutes);
  const response = await app.inject({ url: "/search?q=coca%20zero&lat=0&lng=0&sort=recommended&radiusKm=25" });
  assert.equal(response.statusCode, 200);
  const data = response.json();
  assert.equal(data.radiusKm, 25);
  assert.equal(data.results[0].quality.freshness, "FRESH");
  assert.equal(data.results[0].quality.confidence, "MEDIUM");
  assert.ok(data.results[0].recommendation.score > 0);
  assert.ok(data.results.every((r: { distanceKm: number }) => r.distanceKm <= 25));
  assert.equal((await app.inject({ url: "/search?q=coca&lat=0&lng=0&radiusKm=-1" })).statusCode, 400);
});
