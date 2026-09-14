import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMessage} from '../src/whatsapp/handle-message.js';
import {WhatsAppSessionStore,MessageDeduplicator,newConversationState} from '../src/whatsapp/session.js';
import {resolveIntent} from '../src/whatsapp/intents.js';
import {conversationRecord,redactConversationText,type ConversationEvent} from '../src/whatsapp/conversation-log.js';
import {compareCart} from '../src/ai/cart.js';
import {runProductAgent} from '../src/ai/agent.js';
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

test('modificación conserva cantidades, confirma ausentes y recalcula solo después de confirmar',async()=>{
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
