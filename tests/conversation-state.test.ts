import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMessage} from '../src/whatsapp/handle-message.js';
import {WhatsAppSessionStore,MessageDeduplicator,newConversationState} from '../src/whatsapp/session.js';
import {resolveIntent} from '../src/whatsapp/intents.js';
import {conversationRecord,redactConversationText,type ConversationEvent} from '../src/whatsapp/conversation-log.js';
import {compareCart} from '../src/ai/cart.js';
import {runProductAgent,searchCartProduct} from '../src/ai/agent.js';
import {safeErrorLog,logError} from '../src/lib/safe-logging.js';
import Fastify from 'fastify';
import {matchesLiveProduct} from '../src/live/matching.js';
import {parseLogArgs} from '../scripts/chat-logs.js';
import type {WhatsAppMessage,WhatsAppWebhookDependencies} from '../src/whatsapp/webhook.js';
import {chat4} from './fixtures/chat4.js';

function harness(){
  const sessions=new WhatsAppSessionStore(),sent:string[]=[],intents:string[]=[],logs:ReturnType<typeof conversationRecord>[]=[];let id=0,searches=0;
  const deps:WhatsAppWebhookDependencies={sessions,deduplicator:new MessageDeduplicator(),getAppSecret:()=>'',getVerifyToken:()=>'',schedule:()=>{},sendText:async(_to,text)=>{sent.push(text);},
    onIntent:intent=>{intents.push(intent);},logConversation:async event=>{logs.push(conversationRecord(event));},
    agent:input=>runProductAgent({...input,compact:true},{model:'mock',createResponse:async()=>({output:[{type:'function_call',name:'findProductOffers',arguments:JSON.stringify({query:/coca/i.test(input.message)?'Coca Zero':'Papas Lays Clásicas',latitude:0,longitude:0,sort:'distance',radiusKm:25})}]} as any),executeTool:async()=>{searches++;return {product:{name:'Producto test',size:'500 g'},results:[],totalResults:0} as any;}}),
    cartSearch:async(items,lat,lon,sort,radius)=>{
      assert.deepEqual(sessions.get('test')?.currentCart,items,'Guardar TODOS los items antes de consultar precios');
      searches++;
      return compareCart(items,lat,lon,sort,radius,async a=>a.query.includes('Terrabusi')?null:{product:{name:a.query,size:'500 g'},totalResults:1,results:[{store:{id:1,chain:'Carrefour',name:'Sucursal sintética',address:'Fixture'},product:{id:1,ean:'7790070336477',name:a.query,brand:'Test',variant:null,size:'500 g'},price:100,distanceKm:1,stock:null,source:'REAL:SEPA',lastCheckedAt:new Date()}]} as any);
    },geocode:async()=>({status:'NOT_FOUND'})};
  const post=(m:Partial<WhatsAppMessage>)=>handleMessage({id:String(++id),from:'test',...m},deps);
  const text=(body:string)=>post({type:'text',text:{body}});
  return {deps,sessions,sent,intents,logs,text,post,searches:()=>searches,state:()=>sessions.get('test')!};
}

test('E2E 16/09: Volvamos a la barata conserva Coca Zero y aplica price',async()=>{
  const h=harness();await h.post({type:'location',location:{latitude:-27,longitude:-66}});
  await h.text('Quiero coca zero');await h.text('Cuál es la más barata?');await h.text('Y la más cercana?');
  const product=h.state().lastProduct!.query,before=h.searches();
  await h.text('Volvamos a la barata');
  assert.equal(h.intents.at(-1),'PRODUCT_FOLLOWUP');assert.equal(h.state().lastProduct?.query,product);
  assert.equal(h.state().sortCriterion,'price');assert.equal(h.searches(),before+1);
  assert.notEqual(h.sent.at(-1),'Decime qué producto querés buscar.');
});

test('chat 21:37/21:42: Más cerca? reutiliza producto y carrito, sin otra inferencia',async()=>{
  const h=harness();await h.post({type:'location',location:{latitude:-27,longitude:-66}});await h.text('La pepsi de 2l');
  const original=h.state().lastProduct!.query;
  for(const [phrase,sort] of [['Más cerca?','distance'],['Más barata?','price'],['Volvamos a la barata','price']]){
    await h.text(phrase!);assert.equal(h.intents.at(-1),'PRODUCT_FOLLOWUP');assert.equal(h.state().lastProduct?.query,original);assert.equal(h.state().sortCriterion,sort);
  }
  await h.text('1 Oreo\n1 Playadito');const before=h.searches();
  await h.text('Agrega al carrito 2 arroz colpado');assert.equal(h.searches(),before);assert.match(h.sent.at(-1)!,/^🛒 Tu carrito actual:/);
  assert.equal(h.state().cartResults,undefined);await h.text('Más cerca?');assert.equal(h.intents.at(-1),'CART_FOLLOWUP');assert.equal(h.searches(),before+1);
});

test('chat 21:51: Sacame el aceite, el arroz colpado y el jabón en polvo quita tres sin recrear carrito',async()=>{
  const h=harness();await h.post({type:'location',location:{latitude:-27,longitude:-66}});
  await h.text('Quiero comprar:\nArroz lucchetti\nAceite girasol natura\nLeche entera la serenísima\nFideos matarazo tirabuzón\nGalletitas chocolinas\nJabón en polvo Diozque');
  await h.text('Agrega al carrito 2 arroz colpado');const before=h.searches();
  await h.text('Sacame el aceite, el arroz colpado y el jabón en polvo');
  assert.equal(h.intents.at(-1),'MODIFY_CART');assert.equal(h.searches(),before);assert.equal(h.state().cartResults,undefined);
  assert.deepEqual(h.state().currentCart.map(i=>i.query),['Arroz lucchetti','Leche entera la serenísima','Fideos matarazo tirabuzón','Galletitas chocolinas']);
  assert.match(h.sent.at(-1)!,/^🛒 Tu carrito actual:/);assert.doesNotMatch(h.sent.at(-1)!,/Sacame|colpado|aceite|jabón/i);
  await h.text('Cuánto gastaría en cada super?');assert.equal(h.intents.at(-1),'CART_FOLLOWUP');assert.equal(h.searches(),before+1);
  await h.text('Sacá las Galletitas chocolinas');assert.equal(h.searches(),before+1);assert.equal(h.state().currentCart.length,3);
  await h.text('Cambiá la leche entera la serenísima de 1 a 3');assert.equal(h.searches(),before+1);assert.equal(h.state().currentCart[1]?.quantity,3);assert.match(h.sent.at(-1)!,/^🛒 Tu carrito actual:/);
});

for(const [message,query,quantity] of [
  ['Agrega al carrito 1 fideo la serenísima de 500 gramos','fideo la serenisima de 500 gramos',1],
  ['Agrega al carrito 3 x oreo','oreo',3],
  ['Agrega al carrito 3 x Oreo','oreo',3],
  ['Agregá una Pepsi black 1,5L','pepsi black 1.5l',1],
] as const){test(`E2E 16/09: ${message} guarda solo producto y cantidad`,async()=>{
  const h=harness();await h.post({type:'location',location:{latitude:-27,longitude:-66}});await h.text('1 Arroz\n1 Leche');
  const before=structuredClone(h.state().currentCart),calls=h.searches();
  await h.text(message);
  assert.equal(h.intents.at(-1),'MODIFY_CART');assert.deepEqual(h.state().currentCart,[...before,{query,quantity}]);
  assert.equal(h.searches(),calls);assert.equal(h.state().cartResults,undefined);assert.match(h.sent.at(-1)!,/^🛒 Tu carrito actual:/);assert.doesNotMatch(JSON.stringify(h.state().currentCart),/al carrito|1 5l/);
});}

for(const message of ['Que tengo en el carrito?','Qué tengo en el carrito?']){
  test(`E2E 16/09: ${message} muestra sin consultar ni comparar`,async()=>{
    const h=harness();await h.post({type:'location',location:{latitude:-27,longitude:-66}});await h.text('2 Oreo\n1 Coca Zero');
    const before=h.searches(),results=h.state().cartResults;
    await h.text(message);assert.equal(h.intents.at(-1),'SHOW_CART');assert.equal(h.searches(),before);
    assert.equal(h.state().cartResults,results);assert.match(h.sent.at(-1)!,/^🛒 Tu carrito:/);assert.match(h.sent.at(-1)!,/2 Oreo/);assert.doesNotMatch(h.sent.at(-1)!,/Total|parcial/);
  });
}

test('E2E 16/09: dirección fallida no secuestra Coca ni Pepsi 1,5lts, conserva carrito y GPS',async()=>{
  const h=harness();await h.post({type:'location',location:{latitude:-27,longitude:-66}});await h.text('1 Oreo\n1 Playadito');
  const cart=structuredClone(h.state().currentCart),location=structuredClone(h.state().location);let geocodes=0;
  h.deps.geocode=async()=>{geocodes++;return {status:'NOT_FOUND'};};
  await h.text('Ahora estoy en otra dirección');await h.text('Uruguay 1010');assert.match(h.sent.at(-1)!,/localidad/);
  await h.text('San Miguel de Tucumán, Tucumán');assert.match(h.sent.at(-1)!,/GPS/);
  assert.equal(h.state().pendingAction,undefined);
  await h.text('Chile 1702, San Miguel de Tucumán, Tucumán');assert.equal(h.intents.at(-1),'SET_LOCATION');assert.match(h.sent.at(-1)!,/GPS/);
  const before=geocodes;
  for(const message of ['Y el precio de una coca zero 1.5l?','Pepsi 1,5lts','Y Pepsi de 1,5lts?']){
    await h.text(message);assert.equal(h.intents.at(-1),'SEARCH_PRODUCT',message);assert.equal(geocodes,before);
    assert.doesNotMatch(h.sent.at(-1)!,/provincia|dirección/);
  }
  assert.deepEqual(h.state().location,location);assert.deepEqual(h.state().currentCart,cart);
  await h.post({type:'location',location:{latitude:-30,longitude:-64}});
  assert.equal(h.state().pendingAction,undefined);assert.equal(h.state().pendingLocation,undefined);assert.deepEqual(h.state().currentCart,cart);
});

test('E2E dirección pendiente: permite consulta explícita o cancelar sin perder carrito',async()=>{
  const h=harness();await h.post({type:'location',location:{latitude:-27,longitude:-66}});await h.text('1 Oreo\n1 Playadito');
  const cart=structuredClone(h.state().currentCart),location=structuredClone(h.state().location);
  await h.text('Uruguay 1010');await h.text('Pepsi 1,5lts');
  assert.equal(h.intents.at(-1),'SEARCH_PRODUCT');assert.equal(h.state().pendingAction,undefined);
  for(const cancel of ['cancelar','cancelar el cambio de ubicación']){
    await h.text('Uruguay 1010');await h.text(cancel);assert.equal(h.intents.at(-1),'CANCEL_LOCATION');
  }
  assert.equal(h.state().pendingAction,undefined);assert.equal(h.state().pendingLocation,undefined);
  assert.deepEqual(h.state().location,location);assert.deepEqual(h.state().currentCart,cart);
});

test('chat(4) completo: intent y estado independientes después de cada turno',async()=>{
  const h=harness();let cart:unknown,lastProduct:string|undefined;
  for(const [message,intent] of chat4){
    const before=h.searches();
    if(message==='GPS_A')await h.post({type:'location',location:{latitude:-27,longitude:-66}});
    else if(message==='GPS_B')await h.post({type:'location',location:{latitude:-26.99998,longitude:-65.99998}});
    else await h.text(message);
    assert.equal(h.intents.at(-1),intent,message);
    if(intent==='CREATE_CART'){
      cart=structuredClone(h.state().currentCart);assert.equal(h.state().currentCart.length,4);
      assert.equal(h.state().currentCart[0]?.quantity,2);assert.match(h.state().currentCart[3]!.query,/magistral/);
      assert.equal(h.state().lastProduct?.query,lastProduct);assert.equal(h.state().cartResults?.winner,null);
    }
    if(cart)assert.deepEqual(h.state().currentCart,cart,`No perder carrito: ${message}`);
    if(intent==='PRODUCT_FOLLOWUP')assert.equal(h.state().sortCriterion,'price');
    if(intent==='SHOW_CART'){assert.equal(h.searches(),before);assert.match(h.sent.at(-1)!,/2 oreo/);assert.match(h.sent.at(-1)!,/Terrabusi/);}
    if(message==='GPS_B'){assert.equal(h.state().location?.latitude,-26.99998);assert.match(h.sent.at(-1)!,/prácticamente/);}
    if(message==='No es la misma')assert.match(h.sent.at(-1)!,/manualmente otro punto/);
    if(intent==='MODIFY_CART'){assert.equal(h.state().pendingAction?.type,'ADD_ITEM');assert.match(h.sent.at(-1)!,/no está en tu carrito/);}
    if(h.state()?.lastProduct)lastProduct=h.state().lastProduct!.query;
  }
  assert.ok(h.logs.some(l=>l.direction==='IN'&&l.messageType==='location'&&l.location));
  assert.ok(h.logs.some(l=>l.direction==='OUT'&&l.detectedIntent==='SHOW_CART'));
  assert.equal(new Set(h.logs.map(l=>l.sessionId)).size,1);
});

for(const [intent,phrases] of [
  ['PRODUCT_FOLLOWUP',['De esas opciones cuál tiene el mejor precio?','Y cuál tiene el mejor precio?','Y por precio?','El que te dije recién','Entre esos resultados priorizo el precio']],
  ['CART_FOLLOWUP',['Cuánto gastaría en cada supermercado con esa compra?','Cuál sería el más barato para la compra que te pasé?','Volviendo a mi compra anterior...','lo mismo','el carro anterior']],
  ['SHOW_CART',['Cómo era mi carrito?','Cuál es mi carrito?','Mostrame la compra que guardaste','Recordame mi carro']],
  ['CHANGE_LOCATION',['quiero cambiar ubicación','nueva ubicación','quiero comprar lo mismo desde otra ubicación','me voy a otra zona','quiero probar desde otro lugar']],
] as const){test(`intención ${intent} reconoce formulaciones distintas por contexto`,()=>{
  const state={...newConversationState(),activeSubject:'product' as const,lastProduct:{query:'Lays',sort:'distance' as const},currentCart:[{query:'Oreo',quantity:2},{query:'Playadito',quantity:1}]};
  for(const phrase of phrases)assert.equal(resolveIntent(phrase,state).name,intent,phrase);
});}

test('modificación conserva cantidades, confirma ausentes y espera una comparación explícita',async()=>{
  const h=harness();await h.post({type:'location',location:{latitude:-27,longitude:-66}});await h.text('2 Oreo\n1 Playadito');
  await h.text('Si en vez de 2 Oreo quiero 3, cómo queda el carrito?');assert.equal(h.state().currentCart[0]?.quantity,3);
  await h.text('sacá las Oreo');assert.deepEqual(h.state().currentCart,[{query:'Playadito',quantity:1}]);
  await h.text('agregá una Coca Zero');assert.equal(h.state().currentCart.find(i=>/coca/i.test(i.query))?.quantity,1);
  const before=h.searches();await h.text('Si en vez de 1 Oreo quiero 3');assert.equal(h.searches(),before);assert.equal(h.state().pendingAction?.type,'ADD_ITEM');
  await h.text('sí');assert.equal(h.state().currentCart.find(i=>/oreo/i.test(i.query))?.quantity,3);assert.equal(h.state().pendingAction,undefined);
});

test('carrito incompleto y error de búsqueda conservan todos los items para SHOW_CART',async()=>{
  const h=harness();await h.post({type:'location',location:{latitude:-27,longitude:-66}});
  h.deps.cartSearch=async()=>{throw new Error('offline');};
  await h.text('2 Oreo\n3 Coca Zero\n1 Fideos Terrabusi');
  assert.equal(h.state().currentCart.length,3);await h.text('Cuál es mi carrito?');assert.match(h.sent.at(-1)!,/3 Coca Zero/);
});

test('matching compartido entiende Tallarín N°7 y tallarines N7 sin sustituir N3',()=>{
  const product={ean:'7790070336477',sku:'test',name:'Fideos tallarines N7 Terrabusi 500 g',brand:'Terrabusi',size:'500 g',url:'https://www.carrefour.com.ar/test/p'};
  assert.equal(matchesLiveProduct('Fideos Terrabusi Tallarín N°7 500 g',product),true);
  assert.equal(matchesLiveProduct('Fideos Terrabusi Tallarín N°3 500 g',product),false);
});

test('logging conserva texto/GPS estructurado e intents, omite secretos y payload binario',()=>{
  const state=newConversationState();const event:ConversationEvent={sessionId:state.sessionId,direction:'IN',messageType:'text',text:'OPENAI_API_KEY=sk-proj-secreto DATABASE_URL=postgresql://user:pass@host/db',detectedIntent:'UNKNOWN',sortCriterion:'price',state};
  const record=conversationRecord(event);assert.doesNotMatch(JSON.stringify(record),/sk-proj-secreto|user:pass/);
  const location=conversationRecord({...event,messageType:'location',text:'/9j/binary',location:{latitude:-27,longitude:-66}});
  assert.equal(location.text,undefined);assert.deepEqual(location.location,{latitude:-27,longitude:-66});
  assert.equal(redactConversationText('Bearer secrettoken'),'Bearer [REDACTADO]');
  assert.deepEqual(parseLogArgs(['--limit','25','--session','fixture']),{limit:25,sessionId:'fixture'});
  assert.throws(()=>parseLogArgs(['--limit','0']));
});

test('SHOW_CART funciona sin GPS ni precios y conserva producto como estado independiente',async()=>{
  const h=harness();await h.text('Quiero papas Lays');
  const product=h.state().lastProduct;
  await h.text('2 Oreo\n3 Coca Zero');
  await h.text('Cómo era mi carrito?');
  assert.equal(h.searches(),0);assert.match(h.sent.at(-1)!,/2 Oreo/);assert.match(h.sent.at(-1)!,/3 Coca Zero/);
  assert.deepEqual(h.state().lastProduct,product);assert.equal(h.state().activeSubject,'cart');
  assert.equal(h.state().pendingAction?.type,'LOCATION');
});

test('seguimiento de producto conserva la calle mientras se espera localidad',async()=>{
  const h=harness();await h.text('Quiero papas Lays');await h.text('Mi ubicación es Italia 4320');
  await h.text('Y por precio?');
  assert.equal(h.state().pendingAction?.type,'LOCATION');
  const pending=h.state().pendingAction;
  assert.equal(pending?.type==='LOCATION'?pending.street:undefined,'Italia 4320');
  assert.equal(h.state().sortCriterion,'price');
});

test('una caída del historial no impide responder ni conservar el carrito',async()=>{
  const h=harness();h.deps.logConversation=async()=>{throw new Error('DB offline');};
  await h.text('2 Oreo\n1 Playadito');await h.text('Cuál es mi carrito?');
  assert.equal(h.state().currentCart.length,2);assert.match(h.sent.at(-1)!,/2 Oreo/);
});

for(const message of ['Cambia las oreo de 1 a 2 unidades','cambiá las Oreo de 1 a 2','poné 2 Oreo','quiero 2 Oreo','Oreo de 1 a 2']){
  test(`E2E MODIFY_CART: ${message}`,async()=>{
    const h=harness();await h.post({type:'location',location:{latitude:-27,longitude:-66}});await h.text('1 Oreo\n3 Playadito');
    const old=h.state().cartResults,before=h.searches(),base=h.deps.cartSearch!;
    h.deps.cartSearch=async(...args)=>{
      assert.equal(h.state().cartResults,undefined,'Invalidar resultados antes de recalcular');
      assert.deepEqual(args[0],[{query:'Oreo',quantity:2},{query:'Playadito',quantity:3}]);
      return base(...args);
    };
    await h.text(message);
    assert.equal(h.intents.at(-1),'MODIFY_CART');assert.equal(h.searches(),before);
    assert.equal(h.state().cartResults,undefined);assert.match(h.sent.at(-1)!,/^🛒 Tu carrito actual:/);
    await h.text('Más barata?');assert.equal(h.searches(),before+1);
    assert.notEqual(h.state().cartResults,old);assert.equal(h.state().cartResults?.winner?.total,500);
  });
}

test('E2E: De esos supermercados cuál me queda más cerca? conserva Coca y faltantes de Vea',async()=>{
  const h=harness();await h.post({type:'location',location:{latitude:-27,longitude:-66}});
  let calls=0;
  h.deps.cartSearch=async(items,lat,lon,sort,radius)=>{
    calls++;assert.equal(calls,1,'Ningún seguimiento de orden debe volver a consultar productos');
    return compareCart(items,lat,lon,sort,radius,async a=>({product:{name:a.query},totalResults:3,results:
      ['Carrefour','Vea','ChangoMás'].flatMap((chain,index)=>chain==='Vea'&&a.query==='Magistral'?[]:[{
        store:{id:index+1,chain,name:`${chain} fixture`,address:'Fixture'},price:100+index*10,distanceKm:[8,1,4][index],
        product:{ean:'fixture',name:a.query,brand:'Fixture'},stock:null,source:'REAL:SEPA',lastCheckedAt:new Date('2026-09-14T10:00:00Z'),
      }])} as any));
  };
  await h.text('1 Oreo\n1 Coca\n1 Playadito\n1 Magistral');
  const original=h.state().cartResults!,snapshot=structuredClone(original.comparisons);
  for(const message of ['De esos supermercados cuál me queda más cerca?','¿Y por precio?','¿Y cuál me queda más cerca?']){
    await h.text(message);assert.equal(h.intents.at(-1),'CART_FOLLOWUP');
    assert.deepEqual(h.state().cartResults!.comparisons,snapshot);
    assert.equal(h.state().cartResults!.comparisons,original.comparisons);
    const vea=h.state().cartResults!.comparisons.find(c=>c.chain==='Vea')!;
    assert.deepEqual(vea.lines.map(l=>[l.item.query,!!l.offer]),[['Oreo',true],['Coca',true],['Playadito',true],['Magistral',false]]);
    assert.equal(vea.total,330);assert.notEqual(h.state().cartResults?.winner?.chain,'Vea','No declarar ganador un carrito incompleto');
  }
  assert.equal(calls,1);assert.match(h.sent.at(-1)!,/Vea/);assert.match(h.sent.at(-1)!,/Magistral/);
});

test('cantidad sin producto no modifica arbitrariamente un carrito con varios items',async()=>{
  const h=harness();await h.text('1 Oreo\n1 Playadito');
  for(const message of ['poné 2','quiero 2','de 1 a 2']){
    await h.text(message);assert.equal(h.intents.at(-1),'MODIFY_CART');assert.match(h.sent.at(-1)!,/qué producto/);
    assert.deepEqual(h.state().currentCart,[{query:'Oreo',quantity:1},{query:'Playadito',quantity:1}]);
  }
});

test('individual/carrito: price y distance conservan el mismo matching y ofertas de Terrabusi',async()=>{
  const query='fideo Terrabusi';
  const rows=['Carrefour','Vea','ChangoMás'].map((chain,i)=>({store:{id:i+1,chain,name:`${chain} fixture`,address:'Fixture'},
    product:{ean:'fixture',name:'Fideos',brand:'Terrabusi',size:'500 g'},price:100+i*10,distanceKm:3-i,stock:null,source:'REAL:SEPA',lastCheckedAt:new Date('2026-09-14')}));
  const dependencies={model:'mock',createResponse:async()=>({output:[{type:'function_call',name:'findProductOffers',arguments:JSON.stringify({query,sort:'distance',radiusKm:25})}]} as any),
    executeTool:async(a:any)=>({product:{name:'Fideos Terrabusi'},totalResults:rows.length,results:[...rows].sort((a1,b)=>a.sort==='price'?a1.price-b.price:a1.distanceKm-b.distanceKm)} as any)};
  for(const sort of ['price','distance'] as const){
    let individual:any;
    await runProductAgent({message:query,latitude:-27,longitude:-66,sort,compact:true,onSearchResult:r=>{individual=r;}},dependencies);
    const cart=await compareCart([{query,quantity:2}],-27,-66,sort,25,a=>searchCartProduct(a,dependencies));
    for(const comparison of cart.comparisons){
      assert.equal(comparison.complete,true);const offer=individual.results.find((r:any)=>r.store.chain===comparison.chain);
      assert.deepEqual(comparison.lines[0]!.offer,offer);assert.equal(comparison.total,offer.price*2);
    }
  }
});

test('logging: Error real conserva message, stack y cause tanto en stdout como en Pino',async t=>{
  const output:string[]=[];t.mock.method(console,'info',(line:string)=>output.push(line));
  const error=Object.assign(new Error('Pepsi fixture failed',{cause:new TypeError('socket fixture failed')}),{headers:{authorization:'never-log-this'},body:{private:'never-log-this'}});
  logError(error,{intent:'SET_LOCATION',query:'Pepsi 3L',stage:'findProductOffers',provider:'VEA'});
  const app=Fastify({logger:{serializers:{err:error=>safeErrorLog(error)},stream:{write:line=>{output.push(String(line));}}}});
  app.log.error({err:error,intent:'SEARCH_PRODUCT',stage:'findProductOffers',query:'Pepsi 3L'});
  await app.close();
  assert.equal(output.length,2);
  for(const line of output){const record=JSON.parse(line);assert.equal(record.err.message,'Pepsi fixture failed');assert.match(record.err.stack,/Error: Pepsi fixture failed/);assert.equal(record.err.cause.message,'socket fixture failed');assert.equal(record.err.cause.name,'TypeError');}
  assert.doesNotMatch(output.join(''),/never-log-this/);
  const circular=new Error('cycle');circular.cause=circular;assert.doesNotThrow(()=>JSON.stringify(safeErrorLog(circular)));
  const secrets=safeErrorLog(new Error('Bearer example-token postgresql://user:pass@fixture/db OPENAI_API_KEY=sk-fixture {"private":"payload"}'));
  assert.doesNotMatch(JSON.stringify(secrets),/example-token|user:pass|sk-fixture|"private"/);
});

for(const failAt of [undefined,'openai.responses','findProductOffers'] as const){
  test(`Pepsi 3L → ubicación → búsqueda: ${failAt??'éxito con servicios simulados'}`,async t=>{
    const output:string[]=[];t.mock.method(console,'info',(line:string)=>output.push(line));
    const h=harness();let searches=0;
    h.deps.agent=input=>runProductAgent({...input,compact:true},{model:'mock',createResponse:async()=>{
      if(failAt==='openai.responses')throw new Error('OpenAI fixture failure');
      return {output:[{type:'function_call',name:'findProductOffers',arguments:JSON.stringify({query:'Pepsi 3L',sort:'distance',radiusKm:25})}]} as any;
    },executeTool:async a=>{
      searches++;assert.equal(a.query,searches===1?'Pepsi 3L':'Pepsi');assert.equal(a.latitude,-27);assert.equal(a.longitude,-66);
      if(failAt==='findProductOffers')throw new Error('Search fixture failure',{cause:new Error('fixture connection refused')});
      return {product:{name:'Pepsi',size:'3 L'},results:[],totalResults:0,radiusKm:25} as any;
    }});
    await h.text('Pepsi 3L');assert.match(h.sent.at(-1)!,/ubicación/);assert.equal(searches,0);
    await h.post({type:'location',location:{latitude:-27,longitude:-66}});
    assert.equal(h.state().lastProduct?.query,'Pepsi 3L');assert.deepEqual(h.state().location,{latitude:-27,longitude:-66});
    if(failAt){
      assert.match(h.sent.at(-1)!,/No pude completar/);
      const diagnostic=output.map(line=>JSON.parse(line)).find(r=>r.stage===failAt);
      assert.ok(diagnostic);assert.equal(diagnostic.query,'Pepsi 3L');assert.match(diagnostic.err.message,/fixture failure/);assert.ok(diagnostic.err.stack);
    }else{assert.equal(searches,2);assert.match(h.sent.at(-1)!,/No encontré ofertas de Pepsi 3 L/);assert.doesNotMatch(h.sent.at(-1)!,/No pude completar/);}
  });
}
