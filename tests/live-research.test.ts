import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {catalogProducts} from "../src/catalog/products.js";
import {parseVtexSearch} from "../src/prices/providers/vtex-parser.js";

const fixture = async (name: string) => JSON.parse(await readFile(new URL(`./fixtures/live-research/${name}.json`,import.meta.url),"utf8"));

test("fixtures live: un EAN Magistral no precargado coincide entre las tres cadenas", async () => {
  const ean = "7790990003039";
  assert.ok(!catalogProducts.some(p=>p.eans.includes(ean)));
  const skus = new Set<string>();
  for (const retailer of ["carrefour","vea","changomas"]) {
    const data = await fixture(retailer);
    const capture = data.captures[0];
    // El payload productSearch observado también conserva el contrato del parser existente.
    const parsed = parseVtexSearch(capture, retailer === "changomas" ? "https://www.masonline.com.ar" : `https://www.${retailer}.com.ar`);
    assert.ok(parsed.some(p=>p.ean===ean && Number(p.price)>0),retailer);
    const product = capture.data.productSearch.products.find((p:any)=>p.items.some((i:any)=>i.ean===ean));
    assert.match(product.productName,/500\s*ml/i);
    skus.add(product.items.find((i:any)=>i.ean===ean).itemId);
    assert.equal(data.physicalStoreMapping,false);
  }
  assert.equal(skus.size,3,"SKU local distinto; EAN compartido");
});

test("fixtures live: Oreo 118/354 y Coca 1,5/2,25 mantienen EAN diferentes", async () => {
  const carrefour = await fixture("carrefour"), changomas = await fixture("changomas");
  const eans = (data:any) => data.captures.flatMap((c:any)=>c.data.productSearch.products.flatMap((p:any)=>p.items.map((i:any)=>i.ean)));
  assert.ok(eans(carrefour).includes("7622201735296"));
  assert.ok(eans(carrefour).includes("7622201735258"));
  assert.ok(eans(changomas).includes("7790895067556"));
  assert.ok(eans(changomas).includes("7790895067570"));
});

test("fixture de retiro relaciona el SKU simulado con un pickup concreto, no con todo el catálogo", async () => {
  const data = await fixture("carrefour-pickup-simulation");
  const item = data.items[0];
  assert.equal(item.id,data.request.body.items[0].id);
  assert.equal(item.availability,"available");
  const pickup = data.pickupPoints[0];
  assert.ok(item.sellerChain.some((seller:string)=>pickup.id.startsWith(seller+"_")));
  assert.ok(data.logisticsInfo.some((l:any)=>l.itemIndex===0 && l.slas.some((s:any)=>s.deliveryChannel==="pickup-in-point" && s.pickupPointId===pickup.id)));
  assert.equal(pickup.address.street,"Catamarca");
  assert.equal(pickup.address.number,"1116");
  assert.equal(data.request.cookies,false);
});
