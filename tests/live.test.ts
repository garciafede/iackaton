import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {ProductSearchOrchestrator} from "../src/live/orchestrator.js";
import {liveCacheKey,type LiveRepository} from "../src/live/repository.js";
import {mapLiveCandidates,nearestBranch} from "../src/live/store-mapping.js";
import {parsePickupSimulation,parseRuntimeCatalog,RetailerHttpProvider,validProviderData} from "../src/live/providers.js";
import {matchesLiveProduct,validEan} from "../src/live/matching.js";
import {formatOffers} from "../src/ai/format-offers.js";
import {retailers,type Branch,type LiveProvider,type LiveRequest,type ProviderData,type Retailer} from "../src/live/types.js";
import {searchProductOffers} from "../src/services/product-search.service.js";
import {catalogProducts} from "../src/catalog/products.js";

const fixtures:Record<string,any>={};
for(const key of ["carrefour","vea","changomas","carrefour-pickup-simulation"])fixtures[key]=JSON.parse(await readFile(new URL(`./fixtures/live-research/${key}.json`,import.meta.url),"utf8"));
const now=new Date("2026-09-13T13:00:00Z");
const input:LiveRequest={query:"detergente magistral ultra limon 500 ml",latitude:-26.814789,longitude:-65.20911,radiusKm:25};
const branches:Branch[]=Object.entries(retailers).map(([key,chain],i)=>({id:i+1,chain,name:`${chain} Fixture`,address:"Catamarca, 1116, San Miguel de Tucumán",latitude:input.latitude+(i+1)*0.005,longitude:input.longitude,source:"REAL:FIXTURE"}));
branches[0]={...branches[0]!,latitude:input.latitude,longitude:input.longitude};
const simulation=structuredClone(fixtures["carrefour-pickup-simulation"]);
simulation.items[0].requestIndex=0; // Campo observado en la respuesta original, omitido del recorte inicial.
function data(retailer:Retailer,date=now):ProviderData {
  return {version:1,retailer,checkedAt:date.toISOString(),warnings:[],candidates:parseRuntimeCatalog(fixtures[retailer.toLowerCase()].captures[0],retailer).filter(c=>matchesLiveProduct(input.query,c.product)).slice(0,1)};
}
function setup(options:{payloads?:ProviderData[];fallback?:any;stores?:Branch[];clock?:()=>Date;providers?:LiveProvider[]}={}) {
  const stored=new Map<string,ProviderData>();let reads=0,saves=0,calls=0;
  const repository:LiveRepository={read:async key=>{reads++;return stored.get(key)??null;},save:async(key,value)=>{saves++;stored.set(key,structuredClone(value));},branches:async()=>options.stores??branches};
  const providers=options.providers??(Object.keys(retailers) as Retailer[]).map(retailer=>({retailer,search:async()=>{calls++;return options.payloads?.find(p=>p.retailer===retailer)??data(retailer,options.clock?.()??now);}}));
  const fallback=(async()=>options.fallback??null) as typeof searchProductOffers;
  const orchestrator=new ProductSearchOrchestrator({providers,repository,fallback,now:options.clock??(()=>now)});
  const search=(extra:Parameters<typeof orchestrator.search>[5]={})=>orchestrator.search(input.query,input.latitude,input.longitude,"price",25,{enabled:true,...extra});
  return {orchestrator,repository,stored,search,counters:()=>({reads,saves,calls})};
}
const stable=(source="REAL:SEPA")=>({product:{id:10,name:"Magistral",brand:"Magistral",size:"500 ml",variant:"Ultra Limón"},totalResults:1,radiusKm:25,evaluatedAt:now,status:"OK",outsideRadiusCount:0,canExpandRadius:false,suggestedRadiusKm:null,
  results:[{store:branches[0]!,product:{id:10,ean:"7790990003039",size:"500 ml",variant:"Ultra Limón"},price:4000,distanceKm:0,stock:null,source,lastCheckedAt:new Date("2026-09-12T13:00:00Z")}]});

test("live: runtime decodifica JSON anidado y conserva EAN/SKU/precio en las tres cadenas",()=>{
  for(const retailer of Object.keys(retailers) as Retailer[]) {
    const raw=fixtures[retailer.toLowerCase()].captures[0];
    const result=parseRuntimeCatalog({queryData:[{data:JSON.stringify(raw.data)}]},retailer);
    assert.ok(result.some(c=>c.product.ean==="7790990003039"&&c.price>0));
    assert.ok(result.every(c=>c.onlineAvailable));
  }
});
test("live: matching exacto, checksum y presentaciones distintas sin mezclar",()=>{
  const product=data("VEA").candidates[0]!.product;
  assert.equal(validEan(product.ean),true);assert.equal(validEan("7790990003038"),false);
  assert.equal(matchesLiveProduct("7790990003039",product),true);
  assert.equal(matchesLiveProduct("magistral 750 ml",product),false);
  assert.equal(matchesLiveProduct("magistral 1.5 litros",product),false);
  assert.equal(matchesLiveProduct("magistral 500 ml",product),true);
  assert.equal(matchesLiveProduct("magistral 500 ml",{...product,ean:null}),true);
  assert.equal(matchesLiveProduct("detergente",{...product,ean:null}),false);
  assert.equal(matchesLiveProduct(input.query,{...product,name:"Magistral Ultra Limón Cremoso 500 ml"}),false);
});
test("live: EAN validado no acepta una descripción contradictoria",()=>{
  const product={...data("VEA").candidates[0]!.product,ean:"7790895067556",name:"Coca Cola Zero 2.25 L",size:"2250 ml"};
  assert.equal(matchesLiveProduct("coca zero",product,["7790895067556"]),false);
});
test("live: Carrefour exact pickup exige el mismo SKU, seller, ítem y ubicación",()=>{
  assert.equal(parsePickupSimulation(simulation,"195332")[0]?.id,"carrefourar0046_0046PR");
  assert.equal(parsePickupSimulation(simulation,"otra-sku").length,0);
  for(const mutate of [(x:any)=>{x.items[0].availability="unavailable";},(x:any)=>{x.items[0].sellerChain=["otro"];},(x:any)=>{x.logisticsInfo[0].itemIndex=1;},(x:any)=>{x.pickupPoints[0].address.geoCoordinates=[999,999];}]) {
    const broken=structuredClone(simulation);mutate(broken);assert.equal(parsePickupSimulation(broken,"195332").length,0);
  }
});
test("live: Carrefour exacto distingue retiro de góndola y conserva precio contextual",()=>{
  const payload=data("CARREFOUR");payload.candidates[0]!.pickups=parsePickupSimulation(simulation,"195332");
  const row=mapLiveCandidates(payload,branches,input,now).results[0]!;
  assert.equal(row.live.storeMappingMethod,"EXACT_PICKUP");assert.equal(row.live.priceScope,"BRANCH_CONFIRMED");
  assert.equal(row.live.availability,"PICKUP_AVAILABLE");assert.equal(row.stock,null);assert.equal(row.price,2788.5);assert.equal(row.store.id,1);
});
for(const retailer of Object.keys(retailers) as Retailer[]) test(`live: ${retailer} inferred nunca confirma stock físico`,()=>{
  const payload=data(retailer);
  const row=mapLiveCandidates(payload,branches,input,now).results[0]!;
  assert.equal(row.store.chain,retailers[retailer]);assert.equal(row.live.storeMappingMethod,"NEAREST_BRANCH_ASSUMPTION");
  assert.equal(row.live.availability,"ASSUMED_NEAREST_BRANCH");assert.equal(row.live.availabilityConfidence,"UNCONFIRMED_AT_STORE");
  assert.equal(row.live.priceScope,"ONLINE_CHAIN");assert.equal(row.stock,null);assert.equal(row.quality?.confidence,"LOW");
});
test("live: nearest branch filtra cadena, DEMO, coordenadas inválidas y radio sin redondear",()=>{
  const chosen=nearestBranch([...branches,{...branches[1]!,id:99,latitude:input.latitude,source:"DEMO"},{...branches[1]!,id:100,latitude:NaN}],"Vea",input);
  assert.equal(chosen?.id,2);
  assert.equal(nearestBranch([{...branches[1]!,latitude:input.latitude+0.225}],"Vea",input),null);
  assert.equal(nearestBranch(branches,"Vea",{...input,radiusKm:0.1}),null);
});
test("live: sin sucursal cercana no asigna un precio a una tienda lejana",()=>{
  const result=mapLiveCandidates(data("CHANGOMAS"),[{...branches[2]!,latitude:0}],input,now);
  assert.equal(result.results.length,0);assert.match(result.notices[0]!,/No encontré una sucursal cercana de ChangoMás/);
  assert.equal(mapLiveCandidates(data("CHANGOMAS"),[{...branches[2]!,latitude:0}],{...input,radiusKm:null},now).results.length,1);
});
test("live: producto no precargado devuelve tres cadenas sin convertir inferencia en certeza",async()=>{
  assert.ok(!catalogProducts.some(p=>p.eans.includes("7790990003039")));
  const context=setup(),result=await context.search();
  assert.equal(result?.results.length,3);assert.equal(context.counters().calls,3);
  assert.ok(result?.results.every(r=>r.live?.availabilityConfidence==="UNCONFIRMED_AT_STORE"));
});
test("live: providers se inician en paralelo y Vea timeout no bloquea las otras cadenas",async()=>{
  let started=0;let release:()=>void=()=>{};const barrier=new Promise<void>(r=>{release=r;});
  const providers=(Object.keys(retailers) as Retailer[]).map(retailer=>({retailer,search:async()=>{started++;if(started===3)release();await barrier;if(retailer==="VEA")await new Promise(()=>{});return data(retailer);}}));
  const result=await setup({providers}).search({timeoutMs:40});
  assert.equal(started,3);assert.equal(result?.results.length,2);
  assert.ok(result?.liveReports?.find(r=>r.retailer==="VEA")?.warnings.includes("TIMEOUT"));
});
test("live: caída de providers conserva SEPA localizado como fallback",async()=>{
  const providers=(Object.keys(retailers) as Retailer[]).map(retailer=>({retailer,search:async()=>{throw new Error("HTTP_403");}}));
  const result=await setup({providers,fallback:stable()}).search();
  assert.equal(result?.results.length,1);assert.equal(result?.results[0]?.source,"REAL:SEPA");assert.equal(result?.results[0]?.live?.priceScope,"SEPA_BRANCH");
});

test('live: error real identifica cada provider y conserva mensaje, causa y etapa sin payloads',async t=>{
  const logs:string[]=[];t.mock.method(console,'info',(line:string)=>logs.push(line));
  const providers=(Object.keys(retailers) as Retailer[]).map(retailer=>({retailer,search:async()=>{throw Object.assign(new Error('provider fixture failed',{cause:new Error('fixture socket failure')}),{request:{token:'private-provider-fixture'}});}}));
  const result=await setup({providers,fallback:stable()}).search({cache:false,persist:false});
  assert.equal(result?.results[0]?.source,'REAL:SEPA');
  const records=logs.map(line=>JSON.parse(line));assert.equal(records.length,3);
  assert.deepEqual(records.map(r=>r.provider).sort(),Object.keys(retailers).sort());
  for(const record of records){assert.equal(record.stage,'provider.search');assert.equal(record.query,input.query);assert.equal(record.intent,'SEARCH_PRODUCT');assert.equal(record.err.message,'provider fixture failed');assert.equal(record.err.cause.message,'fixture socket failure');assert.ok(record.err.stack);}
  assert.doesNotMatch(logs.join(''),/private-provider-fixture/);
});
test("live: no mezcla DEMO cuando obtuvo datos live",async()=>{
  const result=await setup({fallback:stable("DEMO")}).search();
  assert.equal(result?.results.length,3);assert.ok(result?.results.every(r=>r.source!=="DEMO"));
});
test("live: cache hit reutiliza precios y fechas sin volver a llamar retailers",async()=>{
  const context=setup();const first=await context.search();const before=context.counters();const second=await context.search();
  assert.equal(context.counters().calls,before.calls);assert.equal(context.counters().saves,before.saves);
  assert.ok(second?.liveReports?.every(r=>r.cache==="HIT"));assert.deepEqual(second?.results.map(r=>r.lastCheckedAt),first?.results.map(r=>r.lastCheckedAt));
});
test("live: cache expired refresca y no reetiqueta la fecha vieja",async()=>{
  let clock=now;const context=setup({clock:()=>clock});await context.search();clock=new Date(now.getTime()+31*60000);
  const refreshed=await context.search();assert.equal(context.counters().calls,6);assert.ok(refreshed?.results.every(r=>r.lastCheckedAt.getTime()===clock.getTime()));
});
test("live: clave de caché aísla ubicación, radio, cadena y EAN sin exponer coordenadas",()=>{
  const key=liveCacheKey("VEA",input);assert.equal(key.length,64);
  assert.notEqual(key,liveCacheKey("VEA",{...input,latitude:input.latitude+0.001}));
  assert.notEqual(key,liveCacheKey("VEA",{...input,radiusKm:100}));assert.notEqual(key,liveCacheKey("CHANGOMAS",input));
});
test("live: caché inválida o de otra cadena no puede promover mapping",async()=>{
  const context=setup();context.stored.set(liveCacheKey("VEA",input),data("CARREFOUR"));
  assert.equal(validProviderData({...data("VEA"),candidates:[{...data("VEA").candidates[0],pickups:parsePickupSimulation(simulation,"195332")}]},"VEA"),false);
  await context.search();assert.equal(context.counters().calls,3);
});
test("live: flag OFF devuelve exactamente el fallback y no toca caché ni providers",async()=>{
  const fallback=stable(),context=setup({fallback});const result=await context.search({enabled:false});
  assert.equal(result,fallback);assert.deepEqual(context.counters(),{reads:0,saves:0,calls:0});
});
test("live: smoke read-only no escribe caché ni Product",async()=>{
  const context=setup();await context.search({cache:false,persist:false});assert.equal(context.counters().saves,0);assert.equal(context.counters().reads,0);
});
test("live: error de caché no pierde resultados válidos",async()=>{
  const context=setup();context.repository.save=async()=>{throw new Error("secret that must not be printed");};
  const result=await context.search();assert.equal(result?.results.length,3);assert.ok(result?.liveReports?.every(r=>r.warnings.includes("CACHE_WRITE_UNAVAILABLE")));
});
test("live: exacto reciente reemplaza SEPA de la misma sucursal sin duplicarlo",async()=>{
  const exact=data("CARREFOUR");exact.candidates[0]!.pickups=parsePickupSimulation(simulation,"195332");
  const result=await setup({fallback:stable(),payloads:[exact]}).search();
  assert.equal(result?.results.filter(r=>r.store.id===1).length,1);assert.equal(result?.results.find(r=>r.store.id===1)?.live?.priceScope,"BRANCH_CONFIRMED");
});
test("live: ranking precio conserva la inferida barata y recommended favorece confianza",async()=>{
  const exact=data("CARREFOUR");exact.candidates[0]!.pickups=parsePickupSimulation(simulation,"195332");
  const cheap=data("VEA");cheap.candidates[0]!.price=2700;
  const context=setup({payloads:[exact,cheap]});const priceResult=await context.search();assert.equal(priceResult?.results[0]?.store.chain,"Vea");
  const recommended=await context.orchestrator.search(input.query,input.latitude,input.longitude,"recommended",25,{enabled:true});
  assert.equal(recommended?.results[0]?.live?.storeMappingMethod,"EXACT_PICKUP");
});
test("live: formato inferido no afirma precio ni stock en la sucursal aunque stock=true",async()=>{
  const result=(await setup().search())!;result.results[0]!.stock=true;result.results[0]!.live!.availability="PHYSICAL_CONFIRMED";
  const output=formatOffers(result,"price");assert.match(output,/Precio online encontrado en/);assert.match(output,/Disponibilidad en esta sucursal no confirmada/);
  assert.match(output,/Precio en esta sucursal no confirmado/);assert.doesNotMatch(output,/hay stock|stock físico confirmado|disponible en el relevamiento/i);
});
test("live: formato exact pickup conserva la advertencia de góndola",()=>{
  const payload=data("CARREFOUR");payload.candidates[0]!.pickups=parsePickupSimulation(simulation,"195332");
  const output=formatOffers({product:{name:"Magistral",size:"500 ml"},radiusKm:25,results:mapLiveCandidates(payload,branches,input,now).results},"price");
  assert.match(output,/Retiro disponible/);assert.match(output,/Disponibilidad en góndola no confirmada/);assert.match(output,/2\.788,5/);
});
test("live: HTTP usa solo origen público, sin cookies, y no reintenta un 403",async()=>{
  let calls=0;const fake=(async(_url:any,init:any)=>{calls++;assert.equal(init.headers.authorization,undefined);assert.equal(init.headers.cookie,undefined);return new Response("denied",{status:403});}) as typeof fetch;
  await assert.rejects(new RetailerHttpProvider("VEA",fake).search(input,new AbortController().signal),/HTTP_403/);assert.equal(calls,1);
});
test("live: un error de simulación Carrefour conserva el precio online para inferencia",async()=>{
  let calls=0;const fake=(async(_url:any,init:any)=>{calls++;return init.method==="POST"?new Response("fail",{status:500}):new Response(JSON.stringify(fixtures.carrefour.captures[0]),{headers:{"content-type":"application/json"}});}) as typeof fetch;
  const payload=await new RetailerHttpProvider("CARREFOUR",fake).search(input,new AbortController().signal);
  assert.equal(calls,2);assert.equal(payload.candidates.length,1);assert.ok(payload.warnings.includes("PICKUP_UNAVAILABLE"));
  assert.equal(mapLiveCandidates(payload,branches,input,now).results[0]?.live.storeMappingMethod,"NEAREST_BRANCH_ASSUMPTION");
});
