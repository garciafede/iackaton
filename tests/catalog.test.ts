import assert from "node:assert/strict";
import test from "node:test";
import { catalogProducts } from "../src/catalog/products.js";
import { normalizeCatalogText } from "../src/catalog/matching.js";
import { selectedTargets } from "../src/prices/config.js";
import { findBestProduct, type SearchableProduct } from "../src/services/product-search.service.js";
import { buildCatalogReport, renderCatalogDocument, updateReadmeCatalog } from "../src/catalog/report.js";

const products: SearchableProduct[] = catalogProducts.map((p, i) => ({id:i+1, ean:p.eans[0]!, brand:p.brand, name:p.name, variant:p.variant, size:p.size, aliases:p.aliases.map(alias=>({alias}))}));
const key = (query: string) => { const p = findBestProduct(query, products); return p ? catalogProducts[p.id-1]?.key : null; };

test("el dataset validado conserva 60 grupos, EAN y aliases sin colisiones", () => {
  assert.equal(catalogProducts.length,60);
  const eans = catalogProducts.flatMap(p=>p.eans);
  assert.equal(new Set(eans).size,eans.length);
  const aliases = catalogProducts.flatMap(p=>p.aliases.map(normalizeCatalogText));
  assert.equal(new Set(aliases).size,aliases.length);
  for (const p of catalogProducts) for (const alias of p.aliases) assert.equal(key(alias),p.key,alias);
});

test("diez consultas conservan identidad, unidad y presentación del catálogo", () => {
  const cases: Array<[string, string]> = [
    ["coca zero", "coca-zero-1500"], ["oreo 118 g", "oreo-118"],
    ["playadito 1 kg", "playadito-1000"], ["arroz gallo oro", "gallo-oro-1000"],
    ["villavicencio 1500 ml", "villavicencio-1500"], ["villavicencio 2 litros", "villavicencio-2000"],
    ["harina morixe 000", "morixe-000-1000"], ["harina morixe 0000", "morixe-0000-1000"],
    ["cif limon 300 ml", "cif-limon-300"], ["cif limon 500 ml", "cif-limon-500"],
  ];
  for(const [query, expected] of cases) assert.equal(key(query!),expected,query);
  assert.equal(key("coca zero 2.25 litros"),null);
  assert.equal(key("oreo 354 g"),null);
  assert.equal(key("producto inexistente abcxyz"),null);
  assert.equal(key("villavicencio"),null);
});

test("el catálogo validado no limita productos adicionales ya almacenados", () => {
  const extra: SearchableProduct = {id:999,ean:"7790990003039",brand:"Magistral",name:"Detergente Magistral Ultra Limón",variant:"Ultra Limón",size:"500 ml",aliases:[{alias:"magistral ultra limon 500 ml"}]};
  assert.equal(findBestProduct("magistral ultra limon 500 ml",[...products,extra])?.id,999);
});

test("SEPA selecciona el catálogo y Playwright mantiene cinco consultas por defecto", () => {
  assert.equal(selectedTargets().length,60);
  assert.equal(selectedTargets(undefined,{forPlaywright:true}).length,5);
  assert.equal(selectedTargets(undefined,{forPlaywright:true,all:true}).length,60);
  assert.equal(selectedTargets("cif-limon-300",{forPlaywright:true}).length,1);
  assert.ok(selectedTargets(undefined,{category:"Limpieza"}).every(p=>p.category==="Limpieza"));
});

test("el reporte cuenta grupos con ofertas reales y se regenera sin duplicar tablas", () => {
  const report = buildCatalogReport(catalogProducts,[{ean:catalogProducts[0]!.eans[0]!,storeId:1,chain:"Fixture",source:"REAL:SEPA",lastCheckedAt:new Date("2026-09-12T11:30:02Z")},
    {ean:catalogProducts[1]!.eans[0]!,storeId:1,chain:"Fixture",source:"DEMO",lastCheckedAt:new Date("2026-09-12T11:30:02Z")}]);
  assert.equal(report.available,1); assert.equal(report.offers,1); assert.equal(report.missing.length,59);
  const readme = updateReadmeCatalog("# PoC\n\n## Uso\n",report);
  assert.equal(updateReadmeCatalog(readme,report),readme);
  assert.match(renderCatalogDocument(report),/no un máximo/);
});
