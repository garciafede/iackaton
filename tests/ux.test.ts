import test from "node:test";
import assert from "node:assert/strict";
import {runProductAgent,searchCartProduct} from "../src/ai/agent.js";
import {answerStoreQuestion,followupSort,requestedSort} from "../src/ai/conversation.js";
import {compareCart,formatCart,MAX_CART_ITEMS,parseCart} from "../src/ai/cart.js";
import {formatCompactOffers} from "../src/ai/format-compact.js";
import {geocodeAddress,parseGeoref,writtenAddress} from "../src/whatsapp/geocoding.js";
import {handleMessage} from "../src/whatsapp/handle-message.js";
import {WhatsAppSessionStore,MessageDeduplicator} from "../src/whatsapp/session.js";
import type {WhatsAppWebhookDependencies,WhatsAppMessage} from "../src/whatsapp/webhook.js";
import {calculateDistanceKm} from "../src/utils/distance.js";
import {mapLiveCandidates,nearestBranch} from "../src/live/store-mapping.js";

// Importes, direcciones y coordenadas son fixtures en memoria; sin llamadas reales.
const input="Quiero comprar:\n1 Oreo\n1 Coca Zero\n1 Playadito\n1 detergente Magistral\n1 arroz 53\n\n¿Dónde es más barato?";
const names=["Carrefour","Vea","ChangoMás"];
const offer=(chain:string,price:number,storeId=names.indexOf(chain)+1):any=>({store:{id:storeId,chain,name:`${chain} test`,address:"Dirección sintética"},price,distanceKm:storeId,stock:null,source:`REAL:LIVE:${chain.toUpperCase()}`,lastCheckedAt:new Date("2026-09-13T13:00:00Z"),product:{id:1,ean:"7790895067556",name:"Producto test",variant:null,size:"500 ml"},live:{priceScope:"ONLINE_CHAIN",storeMappingMethod:"NEAREST_BRANCH_ASSUMPTION",fulfillment:"UNKNOWN",availabilityConfidence:"UNCONFIRMED_AT_STORE"}});
const result=(rows:any[]):any=>({product:{id:1,name:"Producto test",brand:"Test",variant:null,size:"500 ml"},results:rows,totalResults:rows.length,radiusKm:25});
const args={query:"Coca Zero",latitude:-26,longitude:-65,sort:"distance",radiusKm:25};
for(const phrase of ["más barato","más barata","dónde conviene","menor precio"]){
  test(`UX: ${phrase} impone precio ascendente aunque el modelo seleccione distancia`,async()=>{
    let actual:any;
    const response=await runProductAgent({message:`Buscame Coca Zero, ${phrase}`,latitude:-26,longitude:-65,compact:true},{model:"mock",createResponse:async()=>({output:[{type:"function_call",name:"findProductOffers",arguments:JSON.stringify(args)}]}) as any,executeTool:async(input)=>{actual=input;return result([offer("Carrefour",300),offer("Vea",100),offer("ChangoMás",200)]);}});
    assert.equal(actual.sort,"price");assert.ok(response.message.indexOf("Vea test")<response.message.indexOf("ChangoMás test"));assert.ok(response.message.indexOf("ChangoMás test")<response.message.indexOf("Carrefour test"));
  });
}
test("UX: ¿Y la más barata? reutiliza Coca Zero y evita otra inferencia",async()=>{
  assert.equal(followupSort("¿Y la más barata?"),"price");let actual:any;
  await runProductAgent({message:"¿Y la más barata?",latitude:-26,longitude:-65,previousSearch:{query:"Coca Zero",sort:"distance"}},{model:"mock",createResponse:async()=>{throw new Error("No llamar modelo");},executeTool:async(a)=>{actual=a;return result([offer("Vea",100)]);}});
  assert.equal(actual.query,"Coca Zero");assert.equal(actual.sort,"price");
});
test("UX: carrito interpreta los cinco productos y arroz 53 conserva su nombre",()=>{
  const items=parseCart(input)!;assert.equal(items.length,5);assert.deepEqual(items[4],{query:"arroz 53",quantity:1});assert.equal(requestedSort(input),"price");assert.equal(writtenAddress("arroz 53"),undefined);
});
test("UX: carrito completo suma cantidades y elige el supermercado más barato",async()=>{
  const items=parseCart(input)!;items[0]!.quantity=2;const calls:string[]=[];
  const cart=await compareCart(items,-26,-65,"price",25,async a=>{calls.push(a.query);return result(names.map((chain,i)=>offer(chain,100+i*10)));});
  assert.equal(calls.length,5);assert.equal(cart.winner?.chain,"Carrefour");assert.equal(cart.winner.total,600);assert.equal(cart.comparisons[1]?.total,660);
  const text=formatCart(cart);assert.match(text,/Más barato/);assert.match(text,/100,00 c\/u/);assert.doesNotMatch(text,/EAN|REAL:|2026|lastChecked/);assert.match(text,/disponibilidad local no confirmados/);
});
test("UX: producto faltante no gana contra carrito completo y muestra total parcial",async()=>{
  const cart=await compareCart(parseCart(input)!,-26,-65,"price",25,async a=>result(names.filter(c=>!(c==="Carrefour"&&a.query==="arroz 53")).map((chain,i)=>offer(chain,chain==="Carrefour"?1:100+i))));
  assert.notEqual(cart.winner?.chain,"Carrefour");const partial=cart.comparisons.find(c=>c.chain==="Carrefour")!;assert.equal(partial.complete,false);assert.equal(partial.total,4);assert.match(formatCart(cart),/arroz 53 — no encontrado/);assert.match(formatCart(cart),/Total parcial/);
});
test("UX: sin carrito completo no declara ganador",async()=>{
  const cart=await compareCart(parseCart(input)!,-26,-65,"price",25,async a=>a.query==="arroz 53"?null:result(names.map(c=>offer(c,100))));
  assert.equal(cart.winner,null);assert.match(formatCart(cart),/Ninguna cadena tiene precio para todo/);
});
test("UX: no suma sucursales distintas ni mezcla canales como compra única",async()=>{
  let index=0;const cart=await compareCart(parseCart(input)!,-26,-65,"price",25,async()=>result([offer("Carrefour",100,++index)]));assert.equal(cart.winner,null);
});
test("UX: presentaciones ambiguas no se comparan como el mismo artículo",async()=>{
  const cart=await compareCart(parseCart(input)!,-26,-65,"price",25,async()=>{const a=offer("Vea",100),b=offer("Carrefour",1);b.product={...b.product,ean:"7790990003039",size:"750 ml"};return result([a,b]);});assert.equal(cart.winner,null);assert.equal(cart.ambiguous.length,5);
});
test("UX: un error de producto conserva el resto y detalles solo si se piden",async()=>{
  const cart=await compareCart(parseCart(input)!,-26,-65,"price",25,async a=>{if(a.query==="arroz 53")throw new Error("offline");return result([offer("Vea",100)]);});assert.equal(cart.comparisons[1]?.total,400);assert.match(formatCart(cart,true),/EAN/);
});
test("UX: formato WhatsApp breve conserva nota y permite formato detallado aparte",()=>{
  const text=formatCompactOffers(result([offer("Vea",100)]),"price");assert.match(text,/Menor precio/);assert.match(text,/precio y disponibilidad local no confirmados/);assert.doesNotMatch(text,/EAN|2026|REAL:/);
});
const geodata={total:1,direcciones:[{altura:{valor:4320},ubicacion:{lat:-26,lon:-65},nomenclatura:"Dirección sintética"}]};
test("UX: dirección incompleta consulta sin contexto geográfico predeterminado",async()=>{
  for(const text of ["Italia 4320","Mi ubicación es Italia 4320","Cambiar ubicación a Italia 4320"])assert.equal(writtenAddress(text),"Italia 4320");
  const fetcher=(async(url:URL)=>{assert.equal(url.searchParams.get("direccion"),"Italia 4320");assert.equal(url.searchParams.has("localidad_censal"),false);assert.equal(url.searchParams.has("provincia"),false);return Response.json(geodata);}) as typeof fetch;
  assert.deepEqual(await geocodeAddress("Italia 4320",fetcher),{status:"OK",latitude:-26,longitude:-65,label:"Dirección sintética"});
});
test("UX: ciudad explícita se consulta sin asumir provincia y la ambigüedad requiere aclaración",async()=>{
  const fetcher=(async(url:URL)=>{assert.equal(url.searchParams.get("localidad_censal"),"Yerba Buena");assert.equal(url.searchParams.has("provincia"),false);return Response.json({...geodata,total:2});}) as typeof fetch;
  assert.deepEqual(await geocodeAddress("Italia 4320, Yerba Buena",fetcher),{status:"AMBIGUOUS"});
});
test("UX: geocodificación no inventa coordenadas ni acepta otra altura",async()=>{
  assert.deepEqual(parseGeoref({total:1,direcciones:[{altura:{valor:4320},ubicacion:{lat:null,lon:null}}]},"4320"),{status:"NOT_FOUND"});
  assert.deepEqual(parseGeoref(geodata,"4319"),{status:"NOT_FOUND"});
  assert.deepEqual(await geocodeAddress("Italia 4320",(async()=>{throw new Error("network");}) as typeof fetch),{status:"UNAVAILABLE"});
});
function harness(){
  const sessions=new WhatsAppSessionStore(),calls:any[]=[],sent:string[]=[],geocodes:string[]=[];let id=0;
  const deps:WhatsAppWebhookDependencies={sessions,deduplicator:new MessageDeduplicator(),getAppSecret:()=>"test",getVerifyToken:()=>"test",schedule:()=>{},sendText:async(_to,body)=>{sent.push(body);},agent:async a=>{calls.push(a);return {message:a.latitude===undefined?"Compartime tu ubicación":"Resultado",toolUsed:a.latitude!==undefined,...(a.latitude!==undefined?{toolArguments:{query:followupSort(a.message)?a.previousSearch?.query??"":a.message,sort:requestedSort(a.message)??a.previousSearch?.sort??"distance",latitude:a.latitude,longitude:a.longitude!,radiusKm:25}}:{})};},geocode:async address=>{geocodes.push(address);return {status:"OK",latitude:-26,longitude:-65,label:"Fixture"};},cartSearch:async(items,lat,lon,sort,radius)=>compareCart(items,lat,lon,sort,radius,async()=>result(names.map(c=>offer(c,100))))};
  const post=(m:Partial<WhatsAppMessage>,user="a")=>handleMessage({id:String(++id),from:user,...m},deps);
  const text=(body:string,user="a")=>post({type:"text",text:{body}},user);
  const gps=(user="a")=>post({type:"location",location:{latitude:-27,longitude:-66}},user);
  return {sessions,calls,sent,geocodes,deps,text,gps};
}
test("UX: multitur­no reutiliza ubicación/producto/criterio y aísla usuarios",async()=>{
  const h=harness();await h.text("Buscame Coca Zero");await h.gps();await h.text("¿Y la más barata?");assert.equal(h.calls.at(-1).previousSearch.query,"Buscame Coca Zero");assert.equal(h.calls.at(-1).latitude,-27);assert.equal(h.sessions.get("a")?.sort,"price");
  await h.text("Hola");assert.doesNotMatch(h.sent.at(-1)!,/compartime/i);await h.text("Buscame Oreo","b");assert.equal(h.calls.at(-1).latitude,undefined);
});
test("UX: carrito y criterio se conservan después de GPS y seguimiento",async()=>{
  const h=harness();await h.text(input);await h.gps();assert.equal(h.sessions.get("a")?.cart?.length,5);await h.text("¿Y la más barata?");assert.equal(h.sessions.get("a")?.cart?.length,5);assert.equal(h.sessions.get("a")?.sort,"price");assert.match(h.sent.at(-1)!,/🛒/);
  await h.text("Buscame Coca Zero");assert.equal(h.sessions.get("a")?.cart,undefined);
});
test("UX: cambiar ubicación conserva búsqueda y reemplaza coordenadas confirmadas",async()=>{
  const h=harness();await h.gps();await h.text("Buscame Coca Zero");await h.text("cambiar ubicación");assert.equal(h.sessions.get("a")?.changingLocation,true);assert.equal(h.sessions.get("a")?.latitude,-27);
  await h.text("Italia 4320");assert.equal(h.sessions.get("a")?.latitude,-26);assert.equal(h.sessions.get("a")?.previousSearch?.query,"Buscame Coca Zero");await h.text("¿Y la más barata?");assert.equal(h.calls.at(-1).latitude,-26);
});
test("UX: dirección después del producto ejecuta búsqueda pendiente sin pedir GPS",async()=>{
  const h=harness();await h.text("Buscame Coca Zero");await h.text("Mi ubicación es Italia 4320");assert.equal(h.calls.at(-1).latitude,-26);assert.equal(h.sessions.get("a")?.pendingMessage,undefined);
});
test("UX: dirección ambigua conserva ubicación y acepta localidad de aclaración",async()=>{
  const h=harness();await h.gps();h.deps.geocode=async a=>{h.geocodes.push(a);return a.includes(",")?{status:"OK",latitude:-26,longitude:-65,label:"Fixture"}:{status:"AMBIGUOUS"};};
  await h.text("Cambiar ubicación a Italia 4320");assert.equal(h.sessions.get("a")?.latitude,-27);assert.equal(h.sent.at(-1),"¿En qué localidad o ciudad es?");await h.text("Yerba Buena");assert.equal(h.geocodes.at(-1),"Italia 4320, Yerba Buena");assert.equal(h.sessions.get("a")?.latitude,-26);
});

test("UX: cero resultados pide ciudad y conserva ciudad al pedir provincia",async()=>{
  const h=harness();
  h.deps.geocode=async address=>{h.geocodes.push(address);return address.split(",").length===3?{status:"OK",latitude:-26,longitude:-65,label:"Fixture"}:{status:"NOT_FOUND"};};
  await h.text("Mi ubicación es Italia 4320");
  assert.equal(h.sent.at(-1),"¿En qué localidad o ciudad es?");
  assert.equal(h.sessions.get("a")?.latitude,undefined);
  await h.text("Rosario");
  assert.equal(h.sent.at(-1),"¿En qué provincia?");
  assert.equal(h.sessions.get("a")?.pendingAddress,"Italia 4320, Rosario");
  await h.text("Santa Fe");
  assert.deepEqual(h.geocodes,["Italia 4320","Italia 4320, Rosario","Italia 4320, Rosario, Santa Fe"]);
  assert.equal(h.sessions.get("a")?.latitude,-26);
  assert.equal(h.sessions.get("a")?.pendingAddress,undefined);
  assert.equal(h.sessions.get("a")?.pendingAddressQuestion,undefined);
  assert.equal(h.calls.length,0);
});

test("UX: dirección completa consulta sus filtros y se acepta sin preguntas",async()=>{
  const h=harness();
  h.deps.geocode=address=>geocodeAddress(address,(async(url:URL)=>{
    assert.equal(url.searchParams.get("direccion"),"Italia 4320");
    assert.equal(url.searchParams.get("localidad_censal"),"San Miguel de Tucumán");
    assert.equal(url.searchParams.get("provincia"),"Tucumán");
    return Response.json(geodata);
  }) as typeof fetch);
  await h.text("Italia 4320, San Miguel de Tucumán, Tucumán");
  assert.equal(h.sent.length,1);assert.doesNotMatch(h.sent[0]!,/¿|GPS/);
  assert.equal(h.sessions.get("a")?.latitude,-26);
});

test("UX: ambigüedad persistente ofrece GPS sin reemplazar la ubicación anterior",async()=>{
  const h=harness();await h.gps();h.deps.geocode=async()=>({status:"AMBIGUOUS"});
  await h.text("Italia 4320");assert.equal(h.sent.at(-1),"¿En qué localidad o ciudad es?");
  await h.text("Córdoba");assert.equal(h.sent.at(-1),"¿En qué provincia?");
  await h.text("Córdoba");assert.match(h.sent.at(-1)!,/ubicación GPS/);
  assert.equal(h.sessions.get("a")?.latitude,-27);
  assert.equal(h.sessions.get("a")?.pendingAddressQuestion,undefined);
  await h.gps();assert.equal(h.sessions.get("a")?.pendingAddress,undefined);
  assert.equal(h.sessions.get("a")?.changingLocation,undefined);
});

test("UX: dirección completa sin resultados ofrece GPS directamente",async()=>{
  const h=harness();h.deps.geocode=async()=>({status:"NOT_FOUND"});
  await h.text("Italia 4320, Rosario, Santa Fe");
  assert.equal(h.sent.length,1);assert.match(h.sent[0]!,/ubicación GPS/);
  assert.equal(h.sessions.get("a")?.latitude,undefined);
});

test("UX: acepta ciudad y provincia juntas al aclarar sin otra pregunta",async()=>{
  const h=harness();h.deps.geocode=async address=>{h.geocodes.push(address);return address.includes(",")?{status:"OK",latitude:-26,longitude:-65,label:"Fixture"}:{status:"AMBIGUOUS"};};
  await h.text("Italia 4320");await h.text("Rosario, Santa Fe");
  assert.equal(h.geocodes.at(-1),"Italia 4320, Rosario, Santa Fe");
  assert.equal(h.sessions.get("a")?.latitude,-26);assert.equal(h.sent.length,2);
});

test("UX: aclaraciones geográficas aíslan usuarios y una nueva dirección reinicia contexto",async()=>{
  const h=harness();h.deps.geocode=async address=>{h.geocodes.push(address);return {status:"NOT_FOUND"};};
  await h.text("Italia 4320");await h.text("Rosario");
  await h.text("Italia 4320","b");assert.equal(h.sent.at(-1),"¿En qué localidad o ciudad es?");
  assert.equal(h.sessions.get("a")?.pendingAddress,"Italia 4320, Rosario");
  await h.text("Mi ubicación es Mitre 123");assert.equal(h.sent.at(-1),"¿En qué localidad o ciudad es?");
  await h.text("Mendoza");assert.equal(h.geocodes.at(-1),"Mitre 123, Mendoza");
  await h.text("cambiar ubicación");assert.equal(h.sessions.get("a")?.pendingAddress,undefined);
  assert.equal(h.sessions.get("a")?.pendingAddressQuestion,undefined);
});

test("UX: caída de Georef ofrece GPS sin inventar ubicación ni pedir contexto",async()=>{
  const h=harness();h.deps.geocode=async()=>({status:"UNAVAILABLE"});
  await h.text("Italia 4320");assert.match(h.sent.at(-1)!,/ubicación GPS/);
  assert.equal(h.sessions.get("a")?.latitude,undefined);
  assert.equal(h.sessions.get("a")?.pendingAddressQuestion,undefined);
});

test("UX: aclaración de dirección conserva carrito pendiente y reutiliza ubicación resuelta",async()=>{
  const h=harness();h.deps.geocode=async address=>address.split(",").length===3?{status:"OK",latitude:-26,longitude:-65,label:"Fixture"}:{status:"AMBIGUOUS"};
  await h.text(input);await h.text("Italia 4320");await h.text("Rosario");await h.text("Santa Fe");
  assert.equal(h.sessions.get("a")?.cart?.length,5);
  assert.equal(h.sessions.get("a")?.pendingMessage,undefined);
  assert.match(h.sent.at(-1)!,/Más barato/);
  await h.text("¿y cuál me queda más cerca?");
  assert.equal(h.sessions.get("a")?.sort,"distance");assert.equal(h.sessions.get("a")?.latitude,-26);
  assert.doesNotMatch(h.sent.at(-1)!,/Compartime tu ubicación/);
});

test("UX: Georef con múltiples direcciones nunca elige una aunque total sea inconsistente",()=>{
  assert.deepEqual(parseGeoref({...geodata,direcciones:[...geodata.direcciones,...geodata.direcciones]},"4320"),{status:"AMBIGUOUS"});
});

test("UX: Bolivia 4536 conserva calle y reintenta Georef con ciudad y provincia juntas",async()=>{
  const h=harness();const requests:URL[]=[];
  h.deps.geocode=address=>geocodeAddress(address,(async(url:URL)=>{
    requests.push(url);
    return Response.json(requests.length===1?{total:0,direcciones:[]}:{total:1,direcciones:[{altura:{valor:4536},ubicacion:{lat:-26,lon:-65}}]});
  }) as typeof fetch);
  await h.text("Bolivia 4536");
  assert.equal(h.sent.at(-1),"¿En qué localidad o ciudad es?");
  assert.equal(h.sessions.get("a")?.pendingStreetAddress,"Bolivia 4536");
  assert.equal(h.sessions.get("a")?.awaitingLocation,true);
  await h.text("San Miguel de Tucumán, Tucumán");
  assert.equal(requests.length,2);
  assert.equal(requests[1]!.searchParams.get("direccion"),"Bolivia 4536");
  assert.equal(requests[1]!.searchParams.get("localidad_censal"),"San Miguel de Tucumán");
  assert.equal(requests[1]!.searchParams.get("provincia"),"Tucumán");
  assert.equal(h.sent.at(-1),"Ubicación actualizada ✅");
  assert.equal(h.sessions.get("a")?.latitude,-26);
  assert.equal(h.sessions.get("a")?.awaitingLocation,false);
  for(const key of ["pendingStreetAddress","pendingLocality","pendingProvince","pendingAddress"] as const)assert.equal(h.sessions.get("a")?.[key],undefined);
  assert.equal(h.calls.length,0);
});

test("UX: Cambiar ubicación seguido de Italia 1210 con CP nunca entra al carrito",async()=>{
  const h=harness();await h.gps();
  h.deps.agent=async()=>{assert.fail("La dirección no debe llegar al agente");};
  h.deps.cartSearch=async()=>{assert.fail("La dirección no debe buscar un carrito");};
  let requests=0;
  h.deps.geocode=address=>geocodeAddress(address,(async(url:URL)=>{
    requests++;assert.equal(url.searchParams.get("direccion"),"Italia 1210");
    assert.equal(url.searchParams.get("localidad_censal"),"San Miguel de Tucumán");
    assert.equal(url.searchParams.get("provincia"),"Tucumán");
    return Response.json({total:1,direcciones:[{altura:{valor:1210},ubicacion:{lat:-26,lon:-65}}]});
  }) as typeof fetch);
  await h.text("Cambiar ubicación");
  assert.equal(h.sessions.get("a")?.awaitingLocation,true);
  await h.text("Italia 1210, San Miguel de Tucumán, Tucumán, CP 4000");
  assert.equal(requests,1);assert.equal(h.sent.at(-1),"Ubicación actualizada ✅");
  assert.equal(h.sessions.get("a")?.cart,undefined);assert.equal(h.sessions.get("a")?.pendingMessage,undefined);
  assert.equal(h.sessions.get("a")?.awaitingLocation,false);
});

test("UX: GPS durante cambio de ubicación reemplaza coordenadas y limpia contexto pendiente",async()=>{
  const h=harness();
  h.sessions.update("a",{latitude:-26,longitude:-65});
  h.deps.geocode=async()=>({status:"NOT_FOUND"});
  await h.text("Cambiar ubicación");await h.text("Bolivia 4536");await h.text("San Miguel de Tucumán");
  assert.equal(h.sessions.get("a")?.pendingLocality,"San Miguel de Tucumán");
  h.deps.geocode=async()=>{assert.fail("GPS no requiere Georef");};
  await h.gps();
  assert.equal(h.sent.at(-1),"Ubicación actualizada ✅");
  assert.equal(h.sessions.get("a")?.latitude,-27);assert.equal(h.sessions.get("a")?.longitude,-66);
  assert.equal(h.sessions.get("a")?.awaitingLocation,false);
  for(const key of ["pendingStreetAddress","pendingLocality","pendingProvince","pendingAddress","pendingAddressQuestion","changingLocation"] as const)assert.equal(h.sessions.get("a")?.[key],undefined);
  assert.equal(h.calls.length,0);
});

test("UX: cualquier texto durante awaitingLocation queda fuera de carrito y OpenAI",async()=>{
  const h=harness();await h.gps();await h.text("Cambiar ubicación");
  h.deps.geocode=async address=>{h.geocodes.push(address);return {status:"NOT_FOUND"};};
  h.deps.agent=async()=>{assert.fail("No llamar OpenAI durante ubicación pendiente");};
  h.deps.cartSearch=async()=>{assert.fail("No buscar carrito durante ubicación pendiente");};
  await h.text(input);
  assert.equal(h.geocodes.length,1);assert.equal(h.geocodes[0],input);
  assert.equal(h.sessions.get("a")?.cart,undefined);assert.equal(h.sessions.get("a")?.pendingMessage,undefined);
  await h.text("Hola");await h.text("¿Y la más barata?");
  assert.equal(h.geocodes.length,2);assert.equal(h.sessions.get("a")?.awaitingLocation,true);
  assert.equal(h.sessions.get("a")?.latitude,-27);
});

test("UX: mensajes simultáneos del mismo usuario conservan la última búsqueda",async()=>{
  const h=harness();await h.gps();const base=h.deps.agent;
  h.deps.agent=async a=>{if(a.message.includes("Coca"))await new Promise(resolve=>setTimeout(resolve,20));return base(a);};
  await Promise.all([h.text("Buscame Coca Zero"),h.text("¿Y la más barata?")]);
  assert.equal(h.sessions.get("a")?.previousSearch?.query,"Buscame Coca Zero");assert.equal(h.sessions.get("a")?.sort,"price");
});
test("UX: carrito rechaza cantidades inválidas sin descartar silenciosamente productos",()=>{
  assert.throws(()=>parseCart("0 Oreo\n1 Coca Zero"));assert.throws(()=>parseCart("100 Oreo\n1 Coca Zero"));
});

test("UX: ¿Y cuál me queda más cerca? responde sucursal y distancia del carrito actual",async()=>{
  assert.equal(followupSort("¿Y cuál me queda más cerca?"),"distance");
  const h=harness();const sorts:string[]=[];
  h.deps.cartSearch=(items,lat,lon,sort,radius)=>{
    sorts.push(sort??"price");return compareCart(items,lat,lon,sort,radius,async a=>{
      assert.equal(a.sort,sort);
      return result(names.map((c,i)=>({...offer(c,100+i*100),distanceKm:[8,1.5,4][i]})));
    });
  };
  await h.gps();await h.text(input);const priceResponse=h.sent.at(-1)!;
  assert.equal(h.sessions.get("a")?.cartResult?.winner?.chain,"Carrefour");
  await h.text("¿Y cuál me queda más cerca?");
  assert.equal(h.sessions.get("a")?.cart?.length,5);assert.equal(h.sessions.get("a")?.sort,"distance");
  assert.deepEqual(sorts,["price"],"Cercanía reutiliza los precios y faltantes guardados");
  assert.equal(h.sessions.get("a")?.cartResult?.winner?.chain,"Vea");
  assert.match(h.sent.at(-1)!,/Carrito completo más cercano: Vea · Vea test/);
  assert.match(h.sent.at(-1)!,/1,5 km/);assert.doesNotMatch(h.sent.at(-1)!,/1 Oreo|1 Coca Zero/);
  assert.notEqual(h.sent.at(-1),priceResponse);assert.equal(h.calls.length,0);
});

test("UX: fideo Terrabusi usa el mismo agente y herramienta solo y dentro del carrito",async()=>{
  const queries:string[]=[];const interpreted:string[]=[];
  const dependencies={model:"mock",createResponse:async(params:any)=>{
    const message=params.input[0].content;interpreted.push(message);
    return {output:[{type:"function_call",name:"findProductOffers",arguments:JSON.stringify({...args,query:message==="fideo Terrabusi"?"fideos Terrabusi":message})}]} as any;
  },executeTool:async(a:any)=>{
    queries.push(a.query);
    assert.equal(a.latitude,-26);assert.equal(a.longitude,-65);
    return a.query==="fideo Terrabusi"?null:result(names.map(c=>offer(c,100)));
  }};
  const individual=await runProductAgent({message:"fideo Terrabusi",latitude:-26,longitude:-65,sort:"price"},dependencies);
  const cart=await compareCart(parseCart("1 fideo Terrabusi\n1 Oreo")!,-26,-65,"price",25,a=>searchCartProduct(a,dependencies));
  assert.equal(individual.toolUsed,true);assert.equal(individual.toolArguments?.query,"fideos Terrabusi");
  assert.equal(interpreted.filter(q=>q==="fideo Terrabusi").length,2);
  assert.equal(queries.filter(q=>q==="fideos Terrabusi").length,2);
  assert.ok(cart.comparisons.every(c=>c.complete));assert.equal(cart.winner?.total,200);
  assert.doesNotMatch(formatCart(cart),/no encontrado/);
});

test("UX: variantes reales para cambiar ubicación tienen prioridad sobre carrito y producto",async()=>{
  for(const text of ["Quiero cambiar de ubicación","quiero cambiar mi ubicación","puedo cambiar de ubicación"]){
    const h=harness();await h.gps();await h.text(input);const cart=h.sessions.get("a")?.cart;
    h.deps.agent=async()=>{assert.fail("No llamar agente al cambiar ubicación");};
    h.deps.cartSearch=async()=>{assert.fail("No buscar carrito al cambiar ubicación");};
    await h.text(text);
    assert.equal(h.sessions.get("a")?.awaitingLocation,true,text);
    assert.deepEqual(h.sessions.get("a")?.cart,cart);
    assert.match(h.sent.at(-1)!,/Compartí la nueva ubicación/);
    assert.equal(h.sessions.get("a")?.latitude,-27);
  }
});

test("UX: gracias, adiós y chau se atienden antes de carrito y contexto pendiente",async()=>{
  const h=harness();await h.gps();await h.text(input);const cart=h.sessions.get("a")?.cart;
  h.deps.agent=async()=>{assert.fail("No llamar agente ante despedida");};
  h.deps.cartSearch=async()=>{assert.fail("No buscar carrito ante despedida");};
  for(const text of ["gracias","adiós","chau","Muchas gracias","gracias, chau","hasta luego"]){
    await h.text(text);assert.match(h.sent.at(-1)!,/Hasta luego/);
    assert.deepEqual(h.sessions.get("a")?.cart,cart);
  }
  await h.text("Quiero cambiar de ubicación");
  h.deps.geocode=async()=>{assert.fail("No consultar Georef ante despedida");};
  await h.text("gracias, chau");
  assert.match(h.sent.at(-1)!,/Hasta luego/);assert.equal(h.sessions.get("a")?.awaitingLocation,true);
  assert.deepEqual(h.sessions.get("a")?.cart,cart);
});

test("UX: sucursal más cercana con carrito incompleto no se presenta como compra completa",async()=>{
  const cart=await compareCart(parseCart("1 fideo Terrabusi\n1 Oreo")!,-26,-65,"distance",25,async a=>result(names.filter(c=>a.query!=="Oreo"||c!=="Carrefour").map(c=>offer(c,100))));
  const text=formatCart(cart);assert.match(text,/Sucursal más cercana con precios encontrados: Carrefour/);
  assert.match(text,/Carrito incompleto\. No encontrado: Oreo/);assert.match(text,/Total parcial/);
});

for(const separator of ["\n","; ",", "]){
  test(`UX: carrito conserva 1,5 L y 2,25 L con separador ${JSON.stringify(separator)}`,async()=>{
    const message=["1 Coca Zero 1,5 L","2 gaseosa 2,25 L","1 agua 1,5L"].join(separator);
    const items=parseCart(message)!;
    assert.deepEqual(items,[{query:"Coca Zero 1,5 L",quantity:1},{query:"gaseosa 2,25 L",quantity:2},{query:"agua 1,5L",quantity:1}]);
    const queries:string[]=[];
    const cart=await compareCart(items,-26,-65,"price",25,async a=>{queries.push(a.query);return result([offer("Carrefour",100)]);});
    assert.deepEqual(queries,items.map(i=>i.query));assert.equal(cart.winner?.total,400);
    assert.equal(parseCart("Coca Zero 1,5L"),undefined);
  });
}

for(const count of [2,3,4,5,6,10]){
  test(`UX: carrito de ${count} productos procesa todos sin límite oculto de cinco`,async()=>{
    const h=harness();await h.gps();
    const expected=Array.from({length:count},(_,i)=>({query:`Producto test ${i+1}`,quantity:i%2+1}));
    const queries:string[]=[];
    h.deps.cartSearch=(items,lat,lon,sort,radius)=>compareCart(items,lat,lon,sort,radius,async a=>{
      queries.push(a.query);return result(names.map(c=>offer(c,100)));
    });
    await h.text(expected.map(i=>`${i.quantity} ${i.query}`).join("\n"));
    assert.deepEqual(h.sessions.get("a")?.cart,expected);
    assert.deepEqual(queries,expected.map(i=>i.query));
    const compared=h.sessions.get("a")?.cartResult!;
    assert.ok(compared.comparisons.every(c=>c.complete&&c.lines.length===count));
    assert.equal(compared.winner?.total,expected.reduce((sum,i)=>sum+i.quantity*100,0));
    for(const item of expected)assert.ok(h.sent.at(-1)!.includes(item.query));
  });
}

test("UX: 11 productos devuelve el límite exacto sin búsquedas ni carrito parcial",async()=>{
  assert.equal(MAX_CART_ITEMS,10);
  const message=Array.from({length:11},(_,i)=>`1 Producto test ${i+1}`).join("\n");
  const limit="Puedo comparar hasta 10 productos por carrito para mantener una respuesta rápida. Dividí la compra en dos mensajes.";
  assert.throws(()=>parseCart(message),{message:limit});
  let searches=0;
  await assert.rejects(compareCart(Array.from({length:11},(_,i)=>({query:`Producto ${i}`,quantity:1})),-26,-65,"price",25,async()=>{searches++;return null;}),{message:limit});
  assert.equal(searches,0);
  for(const withLocation of [false,true]){
    const h=harness();if(withLocation){await h.gps();await h.text(input);}
    const previous=h.sessions.get("a");
    h.deps.agent=async()=>{assert.fail("No llamar OpenAI para carrito fuera de límite");};
    h.deps.cartSearch=async()=>{assert.fail("No procesar parcialmente 11 productos");};
    await h.text(message);assert.equal(h.sent.at(-1),limit);
    assert.deepEqual(h.sessions.get("a"),previous);
  }
});

test("UX: frases contextuales recalculan carrito con ubicación actual sin buscar producto carrito",async()=>{
  const h=harness();await h.gps();await h.text(input);const items=h.sessions.get("a")!.cart!;
  await h.text("Quiero cambiar de ubicación");await h.text("Mi ubicación es Italia 4320");
  const calls:Array<{latitude:number;longitude:number;sort:unknown}>=[];
  const base=h.deps.cartSearch!;
  h.deps.cartSearch=(cart,latitude,longitude,sort,radius)=>{
    assert.deepEqual(cart,items);calls.push({latitude,longitude,sort});return base(cart,latitude,longitude,sort,radius);
  };
  h.deps.agent=async()=>{assert.fail("No buscar un producto llamado carrito");};
  for(const text of ["Dónde me conviene comprar el carrito ahora?","recalculá el carrito","y el carrito con esta ubicación?"]){
    await h.text(text);assert.deepEqual(h.sessions.get("a")?.cart,items);assert.match(h.sent.at(-1)!,/Más barato/);
  }
  assert.deepEqual(calls,Array.from({length:2},()=>({latitude:-26,longitude:-65,sort:"price"})),"Nueva ubicación y recálculo explícito consultan; el seguimiento reutiliza");
});

test("UX: despedidas compuestas tienen prioridad y conservan carrito sin búsquedas",async()=>{
  const h=harness();await h.gps();await h.text(input);const previous=h.sessions.get("a");
  h.deps.agent=async()=>{assert.fail("No llamar OpenAI ante despedida compuesta");};
  h.deps.cartSearch=async()=>{assert.fail("No interpretar despedida como carrito");};
  for(const text of ["Nada más, hasta luego","eso es todo, gracias","listo, chau","gracias, adiós","Nada más, muchas gracias"]){
    await h.text(text);assert.match(h.sent.at(-1)!,/Hasta luego/);assert.deepEqual(h.sessions.get("a"),previous);
  }
});

test("UX: Cambiar ubicación y nuevo GPS recalculan carrito y cercanía usando únicamente las coordenadas nuevas",async()=>{
  const h=harness();
  const oldLocation={latitude:-27,longitude:-66};
  const newLocation={latitude:-26.85,longitude:-65.85};
  assert.ok(calculateDistanceKm(oldLocation,newLocation)>20);
  // Sucursales fijas y sintéticas: las distancias se calculan con la función de producción.
  const stores=[
    {latitude:-26.999,longitude:-65.999},
    {latitude:-26.845,longitude:-65.845},
    {latitude:-26.925,longitude:-65.925},
  ];
  const searches:Array<{query:string;latitude:number;longitude:number}>=[];
  const search=async(a:{query:string;latitude:number;longitude:number})=>{
    searches.push({query:a.query,latitude:a.latitude,longitude:a.longitude});
    return result(names.map((chain,i)=>({...offer(chain,100+i*10),distanceKm:calculateDistanceKm(a,stores[i]!)})));
  };
  h.deps.cartSearch=(items,lat,lon,sort,radius)=>compareCart(items,lat,lon,sort,radius,search);
  await h.gps();await h.text(input);await h.text("¿cuál me queda más cerca?");
  const before=h.sessions.get("a")!.cartResult!;
  const items=h.sessions.get("a")!.cart!;
  const oldReply=h.sent.at(-1)!;
  assert.equal(before.winner?.chain,"Carrefour");
  assert.ok(searches.every(a=>a.latitude===oldLocation.latitude&&a.longitude===oldLocation.longitude));

  await h.text("Cambiar ubicación");
  assert.equal(h.sessions.get("a")?.latitude,oldLocation.latitude);
  await handleMessage({id:"new-gps-location",from:"a",type:"location",location:newLocation},h.deps);
  assert.equal(h.sent.at(-1),"Ubicación actualizada ✅");
  assert.equal(h.sessions.get("a")?.latitude,newLocation.latitude);
  assert.equal(h.sessions.get("a")?.longitude,newLocation.longitude);
  assert.equal(h.sessions.get("a")?.cartResult,undefined,"Descartar resultados calculados con el GPS anterior");
  assert.equal(h.sessions.get("a")?.awaitingLocation,false);
  assert.deepEqual(h.sessions.get("a")?.cart,items);
  const afterGps=searches.length;

  await h.text("¿cuál me queda más cerca?");
  const after=h.sessions.get("a")!.cartResult!;
  assert.equal(after.winner?.chain,"Vea");
  assert.match(h.sent.at(-1)!,/Carrito completo más cercano: Vea · Vea test/);
  assert.notEqual(h.sent.at(-1),oldReply);
  for(let i=0;i<names.length;i++){
    assert.equal(after.comparisons[i]!.distance,calculateDistanceKm(newLocation,stores[i]!));
    assert.notEqual(after.comparisons[i]!.distance,before.comparisons[i]!.distance);
  }
  assert.equal(searches.length-afterGps,items.length,"Volver a buscar todos los productos");
  await h.text("recalculá el carrito");
  assert.equal(searches.length-afterGps,items.length*2);
  assert.deepEqual(h.sessions.get("a")?.cart,items);
  assert.equal(h.sessions.get("a")?.cartResult?.winner?.chain,"Vea");
  assert.equal(h.calls.length,0,"El seguimiento mantiene el carrito sin pasar al agente individual");

  // Una búsqueda individual posterior también recibe exclusivamente el GPS nuevo.
  await h.text("Buscame Coca Zero");
  assert.equal(h.calls.at(-1).latitude,newLocation.latitude);
  assert.equal(h.calls.at(-1).longitude,newLocation.longitude);
  assert.ok(searches.slice(afterGps).every(a=>a.latitude===newLocation.latitude&&a.longitude===newLocation.longitude));
});

const demoCartMessage="Ahora quiero comprar: \n2 oreo original 118g,\n1 yerba playadito 1kg,\n1 fideos Terrabusi tallarin n° 7 500g\n1 magistral ultra limón 500 ml\nQue supermercado me conviene para comprar todo?";
test("chat real: Buenas y Ahora quiero comprar no son productos",()=>{
  assert.equal(parseCart("Buenas, necesito saber dónde conseguir unas papas lays clásicas"),undefined);
  assert.deepEqual(parseCart(demoCartMessage),[
    {query:"oreo original 118g",quantity:2},{query:"yerba playadito 1kg",quantity:1},
    {query:"fideos Terrabusi tallarin n° 7 500g",quantity:1},{query:"magistral ultra limón 500 ml",quantity:1},
  ]);
});

test("chat real: Lays conserva producto y fuerza precio en todos los seguimientos",async()=>{
  const h=harness();const toolCalls:any[]=[];let modelCalls=0;
  h.deps.agent=a=>runProductAgent({...a,compact:true},{model:"mock",createResponse:async()=>{
    modelCalls++;return {output:[{type:"function_call",name:"findProductOffers",arguments:JSON.stringify({...args,query:"papas lays clásicas",sort:"distance"})}]} as any;
  },executeTool:async a=>{toolCalls.push(a);return result([offer("ChangoMás",4289),offer("Carrefour",4190)]);}});
  await h.text("Buenas, necesito saber dónde conseguir unas papas lays clásicas");await h.gps();
  assert.equal(h.sessions.get("a")?.cart,undefined);
  for(const text of ["Cuál opción me conviene si priorizo el precio?","priorizo el precio","Y por precio?","El que te dije recién"]){
    await h.text(text);assert.equal(toolCalls.at(-1).query,"papas lays clásicas");assert.equal(toolCalls.at(-1).sort,"price");
    assert.match(h.sent.at(-1)!,/Menor precio/);assert.ok(h.sent.at(-1)!.indexOf("Carrefour")<h.sent.at(-1)!.indexOf("ChangoMás"));
  }
  assert.equal(modelCalls,1,"Los seguimientos no necesitan otra inferencia");
  await h.text("Papas lays clásicas por precio");assert.equal(toolCalls.at(-1).sort,"price");
});

test("chat real: referencias al carrito sobreviven a búsquedas individuales intermedias",async()=>{
  const h=harness();await h.gps();await h.text(demoCartMessage);const cart=h.sessions.get("a")!.cart!;
  await h.text("Papas lays");await h.text("Cuánto cuesta una coca zero?");
  assert.equal(h.sessions.get("a")?.cart,undefined);assert.deepEqual(h.sessions.get("a")?.previousCart,cart);
  const searches:Array<{items:unknown;sort:unknown;lat:number;lon:number}>=[];const base=h.deps.cartSearch!;
  h.deps.cartSearch=(items,lat,lon,sort,radius)=>{searches.push({items,sort,lat,lon});return base(items,lat,lon,sort,radius);};
  h.deps.agent=async()=>{assert.fail("No buscar un producto llamado carrito/compra anterior");};
  for(const text of ["Cuánto gastaría en cada supermercado?","De lo anterior que te mandé","Y ahora con el carro anterior donde me conviene comprar por cercanía?","Volviendo a la compra anterior, cuál es la más barata?"]){
    await h.text(text);assert.deepEqual(h.sessions.get("a")?.cart,cart);
  }
  assert.deepEqual(searches,[],"Las referencias conservan el relevamiento del carrito anterior");
  assert.equal(h.sessions.get('a')?.latitude,-27);assert.equal(h.sessions.get('a')?.longitude,-66);
  assert.match(h.sent.at(-1)!,/Más barato/);
});

test("chat real: Terrabusi tallarín del carrito usa exactamente la búsqueda individual",async()=>{
  const queries:string[]=[];const deps={model:"mock",createResponse:async(params:any)=>({output:[{type:"function_call",name:"findProductOffers",arguments:JSON.stringify({...args,query:params.input[0].content})}]} as any),executeTool:async(a:any)=>{queries.push(a.query);return result(names.map(c=>offer(c,100)));}};
  const text="fideos Terrabusi tallarin n° 7 500g";
  await runProductAgent({message:text,latitude:-26,longitude:-65},deps);
  const cart=await compareCart(parseCart(demoCartMessage)!,-26,-65,"price",25,a=>searchCartProduct(a,deps));
  assert.equal(queries.filter(q=>q===text).length,2);assert.ok(cart.comparisons.every(c=>c.lines[2]?.offer));
  assert.ok(cart.comparisons.every(c=>c.complete));assert.equal(cart.winner?.total,500);
});

test("chat real: Terrabusi tallarín N°7 conserva el EAN encontrado aunque el buscador devuelva otras pastas",async()=>{
  // Nombres y EAN observados en el historial; precios sintéticos, sin llamadas externas.
  const tallarin=(chain:string,name:string)=>({...offer(chain,100),product:{id:0,ean:"7790070336477",name,brand:"Terrabusi",variant:null,size:"500 g"}});
  const coditos={...offer("Vea",50),product:{id:0,ean:"7790070335678",name:"Fideos Coditos 500 Grs Terrabusi",brand:"Terrabusi",variant:null,size:"500 g"}};
  const spaghetti={...offer("ChangoMás",40),product:{id:0,ean:"7790070336460",name:"Fideos Spaghetti N°3 500 Grs Terrabusi",brand:"Terrabusi",variant:null,size:"500 g"}};
  const cart=await compareCart(parseCart(demoCartMessage)!,-26,-65,"price",25,async a=>result(a.query.includes("Terrabusi")?[tallarin("Carrefour","Fideos tallarines N7 Terrabusi 500 g."),tallarin("Vea","Fideos Tallarín N°7 500 Grs Terrabusi"),coditos,spaghetti]:names.map(c=>offer(c,100))));
  assert.equal(cart.comparisons[0]?.lines[2]?.offer?.product?.ean,"7790070336477");
  assert.equal(cart.comparisons[1]?.lines[2]?.offer?.product?.ean,"7790070336477");
  assert.equal(cart.comparisons[2]?.lines[2]?.offer,null,"No sustituir tallarín por spaghetti");
  assert.equal(cart.ambiguous.length,0);assert.equal(cart.winner?.total,500);
});

test("chat real: nuevas frases de ubicación tienen prioridad y GPS casi idéntico se explica",async()=>{
  const h=harness();await h.gps();await h.text(demoCartMessage);const cart=h.sessions.get("a")!.cart;
  for(const text of ["Me voy a otra zona, quiero actualizar mi ubicación","Quiero probar en otra ubicación","No me actualizaste la última ubicación","No me actualizaste la última dirección que te pasé"]){
    await h.text(text);assert.equal(h.sessions.get("a")?.awaitingLocation,true);assert.deepEqual(h.sessions.get("a")?.cart,cart);
    assert.match(h.sent.at(-1)!,/Compartí la nueva ubicación/);
  }
  const gps={latitude:-26.99998,longitude:-65.99998};
  await handleMessage({id:"nearby-gps",from:"a",type:"location",location:gps},h.deps);
  assert.equal(h.sent.at(-1),"Ubicación recibida ✅ Es prácticamente la misma que la anterior.");
  assert.equal(h.sessions.get("a")?.latitude,gps.latitude);assert.equal(h.sessions.get("a")?.longitude,gps.longitude);
  assert.equal(h.sessions.get("a")?.cartResult,undefined);
  const base=h.deps.cartSearch!;
  h.deps.cartSearch=(items,lat,lon,sort,radius)=>{assert.equal(lat,gps.latitude);assert.equal(lon,gps.longitude);return base(items,lat,lon,sort,radius);};
  await h.text("Y ahora con el carro anterior donde me conviene comprar por cercanía?");
  assert.match(h.sent.at(-1)!,/más cercano/);
});

test("chat real: pregunta sobre Carrefour Catamarca usa resultados guardados y distancia actual",async()=>{
  const h=harness();await h.gps();
  h.deps.agent=async a=>{
    a.onSearchResult?.(result([{...offer("Carrefour",4190),distanceKm:3.75,store:{id:15,chain:"Carrefour",name:"Carrefour Tucumán III",address:"Av. Catamarca, 1116"}},{...offer("ChangoMás",4289),distanceKm:1.4}]));
    return {message:"Ofertas",toolUsed:true,toolArguments:{...args,sort:"distance",query:"papas lays",latitude:a.latitude!,longitude:a.longitude!}};
  };
  await h.text("Papas lays");h.deps.agent=async()=>{assert.fail("Responder con resultados actuales, sin otra inferencia");};
  await h.text("No es más cerca Carrefour? El de la Catamarca?");
  assert.match(h.sent.at(-1)!,/Carrefour Tucumán III · Av\. Catamarca, 1116: 3,75 km/);
  assert.match(h.sent.at(-1)!,/ChangoMás test queda más cerca: 1,4 km/);
  assert.doesNotMatch(h.sent.at(-1)!,/Decime qué producto/);
  assert.match(answerStoreQuestion("No es más cerca Carrefour? El de la Catamarca?",[])!,/no aparece/);
});

test("chat real: Carrefour Catamarca verificado concilia pickup Hiper Tucumán y participa en más cerca",()=>{
  // Identidad/dirección y coordenadas comerciales verificadas en SEPA y LiveObservation; importes sintéticos.
  const branch={id:15,chain:"Carrefour",name:"Carrefour Tucumán III",address:"Av. Catamarca, 1116, San Miguel de Tucumán, AR-T",latitude:-26.814605,longitude:-65.209515,source:"REAL:SEPA"};
  const pickup={id:"carrefourar0046_0046PR",sellerId:"carrefourar0046",name:"Hiper Tucumán",address:"Catamarca, 1116, San Miguel De Tucumán, Tucumán",latitude:-26.814789,longitude:-65.20911,price:100,shippingEstimate:null};
  const input={query:"Magistral",latitude:branch.latitude,longitude:branch.longitude,radiusKm:25};
  assert.equal(nearestBranch([branch],"Carrefour",input)?.id,15);
  const mapped=mapLiveCandidates({version:1,retailer:"CARREFOUR",checkedAt:new Date().toISOString(),warnings:[],candidates:[{product:{ean:"7790990003015",sku:"test",name:"Producto test",brand:"test",size:"500 ml",url:"https://www.carrefour.com.ar/test/p"},price:100,listPrice:null,onlineAvailable:true,sellerId:"carrefourar0046",pickups:[pickup]}]},[branch],input,new Date());
  assert.equal(mapped.results[0]?.store.id,15);assert.equal(mapped.results[0]?.live.storeMappingMethod,"EXACT_PICKUP");
});

test("chat real: Pésima demo, eso es todo. Muchas gracias nunca entra al carrito",async()=>{
  const h=harness();await h.gps();await h.text(demoCartMessage);const cart=h.sessions.get("a")!.cart;
  h.deps.agent=async()=>{assert.fail("No llamar modelo ante despedida");};h.deps.cartSearch=async()=>{assert.fail("No buscar despedida como carrito");};
  for(const text of ["Pésima demo, eso es todo. Muchas gracias","nada más, hasta luego"]){
    await h.text(text);assert.match(h.sent.at(-1)!,/Hasta luego/);assert.deepEqual(h.sessions.get("a")?.cart,cart);
  }
});
