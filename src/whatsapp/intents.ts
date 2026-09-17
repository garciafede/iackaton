import {isFarewell,isGreeting,requestedSort,answerStoreQuestion,followupSort} from '../ai/conversation.js';
import {parseCart,type CartItem} from '../ai/cart.js';
import {normalizeSearchText} from '../utils/normalize-text.js';
import {writtenAddress} from './geocoding.js';
import type {ConversationState} from './session.js';
import type {SearchSort} from '../services/product-search.service.js';

export type IntentName='SET_LOCATION'|'CHANGE_LOCATION'|'CANCEL_LOCATION'|'SEARCH_PRODUCT'|'PRODUCT_FOLLOWUP'|'CREATE_CART'|'CART_FOLLOWUP'|'MODIFY_CART'|'SHOW_CART'|'SMALLTALK'|'FAREWELL'|'UNKNOWN';
export type CartChange={operation:'add'|'remove'|'set';query:string;quantity:number};
export type Intent={name:IntentName;sort?:SearchSort;query?:string;items?:CartItem[];change?:CartChange;answer?:string;sameLocationDispute?:boolean;confirm?:boolean};
const words=(text:string)=>normalizeSearchText(text).replace(/[.]/g,' ').replace(/\s+/g,' ').trim();
const cartReference=(text:string)=>/\b(carrito|carro|compra|lo anterior|lo mismo)\b/.test(text);
function criterion(text:string):SearchSort|undefined{
  const matches=[...text.matchAll(/(?:mejor|menor|bajo|por|priorizo el) precio|barat\w*|gast\w*|conviene|cerca\w*|distancia/g)];
  const last=matches.at(-1)?.[0];
  return last?(/cerca|distancia/.test(last)?'distance':'price'):requestedSort(text);
}
export function cartChange(message:string):CartChange|undefined{
  const text=normalizeSearchText(message.replace(/(\d),(?=\d)/g,'$1.')).replace(/\b(?:una?|uno)\b/g,'1').replace(/\b(?:dos)\b/g,'2').replace(/\b(?:tres)\b/g,'3');
  const replacement=text.match(/(?:en vez de|en lugar de)\s+\d+\s+(.+?)\s+(?:quiero|pone|poneme|pon|sean)\s+(\d+)/);
  if(replacement)return {operation:'set',query:replacement[1]!,quantity:Number(replacement[2])};
  const transition=text.match(/^(?:(?:cambia|cambiame)\s+)?(?:las? |los? )?(.+?)\s+de\s+\d+\s+a\s+(\d+)(?:\s+unidades?)?$/);
  if(transition)return {operation:'set',query:transition[1]!,quantity:Number(transition[2])};
  const quantity=/[\r\n;,]/.test(message)?null:words(message).match(/^(?:pone|poneme|pon|quiero)\s+(\d+)\s+(?:unidades? de\s+)?(.+?)(?:\s+unidades?|\s+en el carrito|\s+del carrito)?$/);
  if(quantity)return {operation:'set',query:quantity[2]!,quantity:Number(quantity[1])};
  const removal=text.match(/\b(?:saca|quita|elimina|borra)\s+(?:las? |los? )?(.+?)(?: del carrito| de la compra|$)/);
  if(removal)return {operation:'remove',query:removal[1]!,quantity:1};
  const addition=text.match(/\b(?:agrega|anadi|suma|sumale)\s+(?:(?:al carrito|a la compra)\s+)?(?:(\d+)\s+(?:x\s+)?)?(.+?)(?: al carrito| a la compra|$)/);
  if(addition)return {operation:'add',query:addition[2]!,quantity:Number(addition[1]??1)};
  return undefined;
}
export function resolveIntent(message:string,state:ConversationState):Intent{
  const text=words(message),sort=criterion(text),order=sort?{sort}:{};
  const locationTopic=/\b(ubicacion|direccion|zona|lugar|punto)\b/.test(text);
  const locationChange=/\b(cambiar|cambio|actualizar|actualizaste|nueva|nuevo|otra|otro|voy|probar|mude)\b/.test(text);
  const quantityOnly=text.match(/^(?:(?:pone|poneme|quiero)\s+|de\s+\d+\s+a\s+)(\d+)(?:\s+unidades?)?$/);
  const explicitAddress=writtenAddress(message);
  if(explicitAddress&&!(state.currentCart.length&&quantityOnly))return {name:'SET_LOCATION',query:explicitAddress};
  if((state.pendingAction?.type==='LOCATION'||state.pendingLocation)&&/^(?:cancelar|cancela|cancelalo|dejalo)(?: (?:el cambio de ubicacion|la ubicacion|la direccion|el pendiente))?$/.test(text))return {name:'CANCEL_LOCATION'};
  if(locationTopic&&locationChange)return {name:'CHANGE_LOCATION'};
  if(state.lastLocationSimilar&&/\bno\b/.test(text)&&/\b(misma|mismo|igual)\b/.test(text))return {name:'CHANGE_LOCATION',sameLocationDispute:true};
  if(isFarewell(message)||(/\b(gracias|chau|adios|hasta luego)\b/.test(text)&&! /\b(busco|buscame|comprar|agrega)\b/.test(text)))return {name:'FAREWELL'};
  if(isGreeting(message))return {name:'SMALLTALK'};
  if(state.pendingAction?.type==='ADD_ITEM'&&/^(si|dale|agregalo|agregala|no|no gracias)$/.test(text))return {name:'MODIFY_CART',confirm:!text.startsWith('no')};
  if(state.currentCart.length&&quantityOnly)return {name:'MODIFY_CART',change:{operation:'set',query:state.currentCart.length===1?state.currentCart[0]!.query:'',quantity:Number(quantityOnly[1])}};
  const ref=cartReference(text)||(state.currentCart.length>0&&/\b(gastaria|total)\b/.test(text)&&/\b(supermercado|super|cadena)\b/.test(text)),change=cartChange(message);
  if(change&&(!/^(?:pone|poneme|pon|quiero)\s+\d+\b/.test(text)||state.currentCart.length>0))return {name:'MODIFY_CART',change,...order};
  if(state.currentCart.length&&/\b(?:esos|estos) supermercados\b/.test(text)&&sort)return {name:'CART_FOLLOWUP',...order};
  if(ref&&/\b(como|cual|que tengo|mostra\w*|recorda\w*)\b/.test(text)&&!sort&&!/\b(precio|cuesta|gast\w*)\b/.test(text))return {name:'SHOW_CART'};
  if(ref&&!/\b(?:comprar|necesito)\s*:\s*\d/i.test(message)&&!/(?:^|[,;\n])\s*\d+\s/.test(message))return {name:'CART_FOLLOWUP',...order};
  const stored=state.activeSubject==='cart'?state.cartResults?.comparisons.flatMap(c=>c.lines.flatMap(l=>l.offer?[l.offer]:[])):state.lastProductResults;
  const storeAnswer=answerStoreQuestion(message,stored??[]);
  if(storeAnswer)return {name:state.activeSubject==='cart'?'CART_FOLLOWUP':'PRODUCT_FOLLOWUP',answer:storeAnswer,...order};
  const relative=/\b(esas?|estos?|opciones|resultados|recien|anterior|mismo|misma)\b/.test(text)||/^(y\b|el que|la que|priorizo\b|por precio\b)/.test(text)||(!/\b(busca\w*|quiero comprar)\b/.test(text)&&/\b(cual|que opcion)\b/.test(text));
  if((state.lastProduct||state.currentCart.length)&&(followupSort(message)||(relative&&(sort||/\b(recien|mismo|anterior)\b/.test(text))))){
    return {name:state.activeSubject==='cart'&&state.currentCart.length?'CART_FOLLOWUP':'PRODUCT_FOLLOWUP',...order,...(!sort&&followupSort(message)?{sort:followupSort(message)!}:{})};
  }
  if(state.pendingAction?.type==='LOCATION'){
    if(state.pendingAction.resume&&/(?:^|[,;\n])\s*\d+\s/.test(message)){
      const items=parseCart(message);if(items)return {name:'CREATE_CART',items,sort:sort??'price'};
    }
    if(/\b(busca\w*|quiero (?:un|una)|necesito (?:un|una)|precio)\b/.test(text)||/\d+(?:[.,]\d+)?\s*(?:lts?|litros?|l|ml|cc|kg|g|gramos?)\b/i.test(message))return {name:'SEARCH_PRODUCT',query:message,...order};
    // Las aclaraciones de dirección consumen respuestas de contexto, no intents claros como mostrar carrito.
    return {name:'SET_LOCATION',query:message};
  }
  const items=parseCart(message);
  if(items)return {name:'CREATE_CART',items,sort:sort??'price'};
  if(/\b(carrito|carro|compra anterior)\b/.test(text))return {name:'UNKNOWN'};
  return {name:'SEARCH_PRODUCT',query:message,...order};
}
