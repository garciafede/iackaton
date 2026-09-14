import type {executeFindProductOffers} from "./tools.js";
import {searchCartProduct} from "./agent.js";
import {followupSort} from "./conversation.js";
import type {SearchResult,SearchSort} from "../services/product-search.service.js";
import {normalizeSearchText} from "../utils/normalize-text.js";
import {findBestProduct} from "../services/product-search.service.js";
import {queryFitsCatalogProduct} from "../catalog/matching.js";
import {logError} from "../lib/safe-logging.js";

export type CartItem={query:string;quantity:number};
export const MAX_CART_ITEMS=10;
const cartLimitMessage=`Puedo comparar hasta ${MAX_CART_ITEMS} productos por carrito para mantener una respuesta rápida. Dividí la compra en dos mensajes.`;
export function parseCart(message:string):CartItem[]|undefined {
  const text=message.replace(/^\s*(?:hola|buenas|buenos d[ií]as|buenas tardes)\s*[,!:.]\s*/i,"")
    .replace(/^\s*(?:ahora\s+)?(?:quiero comprar|necesito comprar|comprar|mi carrito|mi lista|lista de compras)\s*:?\s*/i,"")
    .replace(/^\s*necesito saber d[oó]nde conseguir\s+(?:unas?\s+|unos?\s+)?/i,"")
    .replace(/[.!?]\s*(?:en qu[eé]|qu[eé] supermercado|d[oó]nde|cu[aá]l)[\s\S]*$/i,"");
  const lines=text.split(/[\r\n;]+|(?<!\d),|,(?!\d)|\s+y\s+(?=\d+\s)/i).map(s=>s.trim()).filter(s=>s&&!/[?¿]/.test(s)&&!followupSort(s));
  if(lines.length<2)return undefined;
  if(lines.length>MAX_CART_ITEMS)throw new Error(cartLimitMessage);
  const items:CartItem[]=[];
  for(const line of lines){
    const match=line.replace(/^[-•]\s*/,"").match(/^(\d+)\s*(?:x\s+|[.)]\s*|\s+)(.+)$/i);
    const query=(match?.[2]??line).trim(),quantity=match?Number(match[1]):1;
    if(!query||query.length>120||!Number.isInteger(quantity)||quantity<1||quantity>99)throw new Error("Indicá cantidades de 1 a 99 y nombres de productos cortos.");
    const existing=items.find(i=>normalizeSearchText(i.query)===normalizeSearchText(query));
    if(existing){existing.quantity+=quantity;if(existing.quantity>99)throw new Error("Máximo 99 unidades por producto.");}
    else items.push({query,quantity});
  }
  return items.length>=2?items:undefined;
}
type CartLine={item:CartItem;offer:SearchResult|null;subtotal:number|null};
export type CartComparison={chain:string;store:string|null;lines:CartLine[];complete:boolean;total:number;online:boolean;distance:number;channel:string};
export type CartResult={comparisons:CartComparison[];winner:CartComparison|null;sort:SearchSort;ambiguous:string[]};
// Cambiar el orden conserva el relevamiento: mismos productos, sucursales y precios.
export function reorderCart(result:CartResult,sort:SearchSort):CartResult {
  const complete=result.comparisons.filter(c=>c.complete).sort((a,b)=>(sort==='distance'?a.distance-b.distance:0)||a.total-b.total);
  return {...result,sort,winner:complete[0]??null};
}
const chains=["Carrefour","Vea","ChangoMás"];
type Search=typeof executeFindProductOffers;
export async function compareCart(items:CartItem[],latitude:number,longitude:number,sort:SearchSort="price",radiusKm:number|null=25,search:Search=searchCartProduct):Promise<CartResult>{
  if(items.length>MAX_CART_ITEMS)throw new Error(cartLimitMessage);
  // Dos productos a la vez; cada orquestador ya paraleliza las tres cadenas.
  const results:Array<Awaited<ReturnType<Search>>>=Array(items.length).fill(null);
  let next=0;
  await Promise.all([0,1].map(async()=>{while(next<items.length){const index=next++;try{results[index]=await search({query:items[index]!.query,latitude,longitude,sort,radiusKm});}catch(error){logError(error,{intent:'CART_SEARCH',query:items[index]!.query,stage:'cart.item.search'});results[index]=null;}}}));
  const ambiguous:string[]=[];
  const offers=results.map((result,index)=>{
    const rows=(result?.results??[]).filter(r=>r.source?.startsWith("REAL:")&&r.stock!==false&&Number.isFinite(r.price)&&r.price>0);
    const identities=new Set(rows.map(r=>r.product?.ean??`${r.product?.brand}:${r.product?.name}:${r.product?.variant}:${r.product?.size}`));
    if(identities.size>1){
      const candidates=rows.filter(r=>r.product?.name&&r.product.brand).map(r=>({...r.product!,name:r.product!.name!,brand:r.product!.brand!,aliases:[]}))
        .filter(p=>queryFitsCatalogProduct(items[index]!.query,[p.name,p.brand,p.variant??"",p.size??""]));
      const distinct=[...new Map(candidates.map(p=>[p.ean??`${p.brand}:${p.name}:${p.size}`,p])).values()];
      const matched=findBestProduct(items[index]!.query,distinct);
      if(matched?.ean)return rows.filter(r=>r.product?.ean===matched.ean);
      ambiguous.push(items[index]!.query);return [];
    }
    return rows;
  });
  const comparisons=chains.map(chain=>{
    const groups=new Map<string,CartComparison>();
    offers.forEach((rows,index)=>{for(const offer of rows.filter(r=>r.store.chain===chain)){
      const channel=offer.live?.priceScope==="ONLINE_CHAIN"?"online":offer.live?.fulfillment==="PICKUP"?"pickup":"local";
      const key=`${offer.store.id||offer.store.externalId||offer.store.address}:${channel}`;
      let group=groups.get(key);
      if(!group){group={chain,store:offer.store.name,channel,lines:items.map(item=>({item,offer:null,subtotal:null})),complete:false,total:0,online:channel!=="local",distance:offer.distanceKm};groups.set(key,group);}
      const line=group.lines[index]!;
      if(!line.offer||offer.price<line.offer.price){line.offer=offer;line.subtotal=Math.round(offer.price*100)*line.item.quantity;}
    }});
    for(const group of groups.values()){group.complete=group.lines.every(l=>l.offer!==null);group.total=group.lines.reduce((total,l)=>total+(l.subtotal??0),0)/100;}
    return [...groups.values()].sort((a,b)=>(sort==="distance"?a.distance-b.distance:0)||Number(b.complete)-Number(a.complete)||b.lines.filter(l=>l.offer).length-a.lines.filter(l=>l.offer).length||a.total-b.total)[0]??{chain,store:null,channel:"local",lines:items.map(item=>({item,offer:null,subtotal:null})),complete:false,total:0,online:false,distance:Infinity};
  });
  const complete=comparisons.filter(c=>c.complete).sort((a,b)=>(sort==="distance"?a.distance-b.distance:0)||a.total-b.total);
  return {comparisons,winner:complete[0]??null,sort,ambiguous};
}
const money=(n:number)=>`$${n.toLocaleString("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const clean=(s:string)=>s.replace(/[\r\n*_`~]/g," ").slice(0,65);
export function formatCart(result:CartResult,details=false):string {
  if(result.sort==="distance"&&!details){
    const nearby=result.comparisons.filter(c=>c.store&&Number.isFinite(c.distance)).sort((a,b)=>a.distance-b.distance);
    const nearest=nearby[0];
    if(!nearest)return "No encontré sucursales con distancia confirmada para tu carrito.";
    const lines=[`📍 ${nearest.complete?"Carrito completo más cercano":"Sucursal más cercana con precios encontrados"}: ${nearest.chain} · ${clean(nearest.store!)}`,`${nearest.distance.toLocaleString("es-AR",{maximumFractionDigits:2})} km · ${nearest.complete?"Total":"Total parcial"}: ${money(nearest.total)}`];
    if(!nearest.complete)lines.push(`Carrito incompleto. No encontrado: ${nearest.lines.filter(l=>!l.offer).map(l=>clean(l.item.query)).join(", ")}.`);
    for(const other of nearby.slice(1))lines.push(`${other.chain} · ${clean(other.store!)}: ${other.distance.toLocaleString("es-AR",{maximumFractionDigits:2})} km${other.complete?"":" · carrito incompleto"}`);
    lines.push(nearby.some(c=>c.online)?"*Precio online; precio y disponibilidad local no confirmados.":"*Precio relevado; disponibilidad no confirmada.");
    return lines.join("\n");
  }
  const winner=result.winner;
  const lines=[winner?`🛒 ${result.sort==="distance"?"Carrito completo más cercano":"Más barato entre carritos completos"}: ${winner.chain}`:"🛒 Ninguna cadena tiene precio para todo el carrito."];
  const order=winner?[winner,...result.comparisons.filter(c=>c!==winner)]:result.comparisons;
  for(const cart of order){
    lines.push(`\n${cart.chain}${cart.store?` · ${clean(cart.store)}`:""}`);
    if(cart===winner||!cart.complete)for(const line of cart.lines)lines.push(`${line.item.quantity} ${clean(line.item.query)} — ${line.subtotal===null?"no encontrado":money(line.subtotal/100)}${line.item.quantity>1&&line.offer?` (${money(line.offer.price)} c/u)`:""}`);
    lines.push(`${cart.complete?"Total":"Total parcial"}: ${money(cart.total)}`);
    if(details)for(const line of cart.lines)if(line.offer)lines.push(`${clean(line.item.query)}: ${line.offer.source}; EAN ${line.offer.product?.ean??"no disponible"}; ${line.offer.lastCheckedAt.toISOString()}; ${line.offer.live?.availabilityConfidence??"disponibilidad no confirmada"}`);
  }
  if(result.ambiguous.length)lines.push(`Indicá marca/presentación de: ${result.ambiguous.map(clean).join(", ")}.`);
  lines.push(result.comparisons.some(c=>c.online)?"*Precio online; precio y disponibilidad local no confirmados.":"*Precio relevado; disponibilidad no confirmada.");
  return lines.join("\n");
}
