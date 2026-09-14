import {compareCart,formatCart,reorderCart,MAX_CART_ITEMS} from '../ai/cart.js';
import {logError} from '../lib/safe-logging.js';
import {resolveMessageRadius} from '../ai/search-preferences.js';
import {wantsDetails} from '../ai/conversation.js';
import {addressParts,geocodeAddress,writtenAddress} from './geocoding.js';
import {calculateDistanceKm} from '../utils/distance.js';
import {normalizeSearchText} from '../utils/normalize-text.js';
import {newConversationState,type ConversationState} from './session.js';
import {resolveIntent,type Intent,type CartChange} from './intents.js';
import type {WhatsAppMessage,WhatsAppWebhookDependencies} from './webhook.js';

const userQueues=new WeakMap<WhatsAppWebhookDependencies,Map<string,Promise<void>>>();
export async function handleMessage(message:WhatsAppMessage,d:WhatsAppWebhookDependencies):Promise<void>{
  if(!message.from)return;
  let queues=userQueues.get(d);if(!queues){queues=new Map();userQueues.set(d,queues);}
  const user=message.from,previous=queues.get(user)??Promise.resolve();
  const current=previous.catch(()=>{}).then(()=>processConversation(message,d));queues.set(user,current);
  try{await current;}finally{if(queues.get(user)===current)queues.delete(user);}
}
async function processConversation(message:WhatsAppMessage,d:WhatsAppWebhookDependencies):Promise<void>{
  const {id,from,type}=message;
  if(!id||!from||!type||d.deduplicator.hasSeen(id))return;
  const state:ConversationState={...(d.sessions.get(from)??newConversationState())};
  const started=Date.now();let intent:Intent={name:'UNKNOWN'},loggedInput=false;
  let stage='intent.resolve',query:string|undefined;
  const save=()=>d.sessions.update(from,state);
  const log=async(direction:'IN'|'OUT',text?:string,error?:string)=>{
    if(!d.logConversation)return;
    try{await d.logConversation({sessionId:state.sessionId,direction,messageType:direction==='IN'?type:'text',...(text?{text}:{}),
      ...(direction==='IN'&&type==='location'&&validLocation(message.location)?{location:message.location}:{}),detectedIntent:intent.name,
      sortCriterion:state.sortCriterion,state,latencyMs:Date.now()-started,...(error?{error}:{})});}
    catch(error){logError(error,{intent:intent.name,query,stage:'conversation.persist'});}
  };
  const send=async(body:string)=>{stage='meta.send';await d.sendText(from,body);await log('OUT',body);};
  const showCart=()=>state.currentCart.length?`🛒 Tu carrito:\n${state.currentCart.map(i=>`${i.quantity} ${i.query}`).join('\n')}`:'Todavía no tenés un carrito guardado. Decime qué productos querés comprar.';
  async function searchProduct(searchQuery:string,followup=false){
    query=followup?state.lastProduct?.query:searchQuery;
    stage='agent.search';
    state.activeSubject='product';
    if(!followup)state.lastProduct={query:searchQuery,sort:state.sortCriterion,radiusKm:resolveMessageRadius(searchQuery)};
    save();
    if(!state.location){state.pendingAction={...(state.pendingAction?.type==='LOCATION'?state.pendingAction:{}),type:'LOCATION',resume:'product'};save();await send((await d.agent({message:searchQuery})).message);return;}
    if(!state.lastProduct){await send('Decime qué producto querés comparar.');return;}
    delete state.lastProductResults;
    const input=followup?(state.sortCriterion==='price'?'más barata':state.sortCriterion==='distance'?'más cercana':searchQuery):searchQuery;
    const result=await d.agent({message:input,...state.location,sort:state.sortCriterion,onSearchResult:r=>{state.lastProductResults=r?.results??[];},...(followup?{previousSearch:state.lastProduct}:{})});
    if(result.toolArguments)state.lastProduct={query:result.toolArguments.query,sort:state.sortCriterion,radiusKm:result.toolArguments.radiusKm??null};
    save();await send(result.message);
  }
  async function searchCart(text:string,reuse=false){
    query=state.currentCart.map(item=>item.query).join('; ');
    state.activeSubject='cart';save();
    if(!state.currentCart.length){await send(showCart());return;}
    if(!state.location){state.pendingAction={...(state.pendingAction?.type==='LOCATION'?state.pendingAction:{}),type:'LOCATION',resume:'cart'};save();await send('Compartime tu ubicación para comparar el carrito.');return;}
    stage='cart.search';
    const refresh=/\b(recalcula\w*|actualiza\w*)\b/.test(normalizeSearchText(text));
    const result=(wantsDetails(text)||(reuse&&!refresh))&&state.cartResults?reorderCart(state.cartResults,state.sortCriterion):await(d.cartSearch??compareCart)(state.currentCart,state.location.latitude,state.location.longitude,state.sortCriterion,resolveMessageRadius(text));
    stage='cart.format';
    state.cartResults=result;save();await send(formatCart(result,wantsDetails(text)));
  }
  async function acceptLocation(location:{latitude:number;longitude:number},address=false){
    const pending=state.pendingAction?.type==='LOCATION'?state.pendingAction:undefined;
    const updating=address||!!pending||!!state.location;
    const announce=!(pending?.resume&&!state.location&&!address);
    state.lastLocationSimilar=!!state.location&&calculateDistanceKm(state.location,location)<0.05;
    state.location={...location};delete state.pendingAction;delete state.cartResults;delete state.lastProductResults;save();
    if(announce){if(updating)await send(state.lastLocationSimilar?'Ubicación recibida ✅ Es prácticamente la misma que la anterior.':'Ubicación actualizada ✅');
    else await send('Ubicación recibida. Ahora decime qué producto querés buscar.');}
    if(pending?.resume==='cart')await searchCart('recalcular');
    else if(pending?.resume==='product'&&state.lastProduct)await searchProduct(state.lastProduct.query);
  }
  async function setAddress(text:string){
    const prior=state.pendingAction?.type==='LOCATION'?state.pendingAction:undefined;
    const fresh=writtenAddress(text);
    const address=fresh??(prior?.street?(prior.question==='province'?`${prior.street}, ${prior.locality}, ${text}`:`${prior.street}, ${text}`):text);
    const {street,locality,province}=addressParts(address);
    state.pendingAction={type:'LOCATION',street,locality,province,...(prior?.resume?{resume:prior.resume}:{})};save();
    stage='georef.resolve';
    const found=await(d.geocode??geocodeAddress)(address);
    if(found.status==='OK'){await acceptLocation({latitude:found.latitude,longitude:found.longitude},true);return;}
    if(found.status==='UNAVAILABLE'){await send('No pude consultar la dirección ahora. Compartí tu ubicación GPS o intentá nuevamente. No cambié tu ubicación anterior.');return;}
    if(!locality){state.pendingAction.question='city';save();await send('¿En qué localidad o ciudad es?');}
    else if(!province){state.pendingAction.question='province';save();await send('¿En qué provincia?');}
    else await send('No pude identificar esa dirección con confianza. Compartí tu ubicación GPS desde WhatsApp.');
  }
  async function modifyCart(change:CartChange){
    if(!change.query.trim()){await send('¿De qué producto del carrito querés cambiar la cantidad?');return;}
    if(!Number.isInteger(change.quantity)||change.quantity<1||change.quantity>99){await send('Indicá cantidades de 1 a 99.');return;}
    const tokens=normalizeSearchText(change.query).split(' ').filter(w=>!['el','la','las','los','un','una'].includes(w));
    const matches=state.currentCart.map((item,index)=>({item,index})).filter(({item})=>tokens.every(w=>normalizeSearchText(item.query).split(' ').includes(w)));
    if(matches.length>1){await send('Hay más de una presentación en tu carrito. Indicá cuál querés modificar.');return;}
    if(!matches.length&&change.operation!=='add'){state.pendingAction={type:'ADD_ITEM',query:change.query,quantity:change.quantity};save();await send(`${change.query} no está en tu carrito. ¿Querés agregar ${change.quantity}?`);return;}
    const cart=state.currentCart.map(item=>({...item}));const match=matches[0];
    if(change.operation==='remove')cart.splice(match!.index,1);
    else if(match)cart[match.index]!.quantity=change.operation==='add'?match.item.quantity+change.quantity:change.quantity;
    else cart.push({query:change.query,quantity:change.quantity});
    if(cart.length>MAX_CART_ITEMS){await send(`Puedo comparar hasta ${MAX_CART_ITEMS} productos por carrito para mantener una respuesta rápida. Dividí la compra en dos mensajes.`);return;}
    if(cart.some(i=>i.quantity>99)){await send('Máximo 99 unidades por producto.');return;}
    state.currentCart=cart;delete state.pendingAction;delete state.cartResults;save();await searchCart('recalcular');
  }
  try{
    intent=type==='location'?{name:'SET_LOCATION'}:type==='text'?resolveIntent(message.text?.body?.trim()??'',state):{name:'UNKNOWN'};
    query=intent.change?.query??(intent.name==='SEARCH_PRODUCT'?intent.query:state.lastProduct?.query);
    if(intent.sort)state.sortCriterion=intent.sort;
    if(!d.sessions.get(from))save();
    d.onIntent?.(intent.name,state);await log('IN',message.text?.body);loggedInput=true;
    if(type==='location'){if(!validLocation(message.location)){await send('No pude leer esa ubicación. Compartila nuevamente desde WhatsApp.');return;}await acceptLocation(message.location);return;}
    if(type!=='text'){await send('Por ahora puedo recibir mensajes de texto y ubicaciones.');return;}
    const text=message.text?.body?.trim();if(!text)return;
    if(intent.answer){await send(intent.answer);return;}
    switch(intent.name){
      case 'CHANGE_LOCATION':state.pendingAction={type:'LOCATION'};save();await send(intent.sameLocationDispute?'Las coordenadas recibidas son prácticamente iguales a las anteriores. Seleccioná manualmente otro punto en el mapa de WhatsApp o compartí un nuevo GPS.':'Compartí la nueva ubicación por WhatsApp o escribí calle y número. Conservaré la anterior hasta confirmar la nueva.');return;
      case 'SET_LOCATION':await setAddress(intent.query??text);return;
      case 'FAREWELL':await send('¡De nada! Hasta luego 👋');return;
      case 'SMALLTALK':await send(state.location?'¡Hola! Ya tengo tu ubicación. Decime qué producto o lista querés buscar.':'¡Hola! Decime qué producto querés buscar y compartime tu ubicación.');return;
      case 'SHOW_CART':state.activeSubject='cart';save();await send(showCart());return;
      case 'MODIFY_CART':
        if(intent.confirm!==undefined&&state.pendingAction?.type==='ADD_ITEM'){const pending=state.pendingAction;delete state.pendingAction;save();if(intent.confirm)await modifyCart({operation:'add',query:pending.query,quantity:pending.quantity});else await send('Dejo tu carrito como estaba.');return;}
        if(intent.change)await modifyCart(intent.change);return;
      case 'CREATE_CART':state.currentCart=intent.items!.map(i=>({...i}));state.activeSubject='cart';delete state.cartResults;if(state.pendingAction?.type!=='LOCATION')delete state.pendingAction;save();await searchCart(text);return;
      case 'CART_FOLLOWUP':await searchCart(text,true);return;
      case 'PRODUCT_FOLLOWUP':if(!state.lastProduct){await send('Decime qué producto querés comparar.');return;}await searchProduct(text,true);return;
      case 'SEARCH_PRODUCT':await searchProduct(intent.query??text);return;
      default:await send('¿Querés consultar un producto, mostrar tu carrito o modificarlo?');
    }
  }catch(error){
    logError(error,{intent:intent.name,query,stage,...(stage==='meta.send'?{provider:'META'}:{})});
    if(!loggedInput)await log('IN',message.text?.body,'INVALID_INPUT');
    const msg=error instanceof Error&&/^(Puedo comparar|Indicá cantidades|Máximo 99|Compará hasta)/.test(error.message)?error.message:'No pude completar la consulta ahora. Conservé tu producto y tu carrito; intentá nuevamente.';
    await log('OUT',undefined,'MESSAGE_PROCESSING_FAILED');await send(msg);
  }
}
function validLocation(value:WhatsAppMessage['location']):value is {latitude:number;longitude:number}{return !!value&&typeof value.latitude==='number'&&typeof value.longitude==='number'&&Number.isFinite(value.latitude)&&Number.isFinite(value.longitude)&&Math.abs(value.latitude)<=90&&Math.abs(value.longitude)<=180;}
