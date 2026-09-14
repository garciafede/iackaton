import {matchesLiveProduct, presentation, validEan} from "./matching.js";
import {logError} from '../lib/safe-logging.js';
import {liveConfig} from "./config.js";
import {retailers, type Candidate, type LiveProvider, type LiveRequest, type Pickup, type ProviderData, type Retailer} from "./types.js";

export const origins: Record<Retailer,string> = {CARREFOUR:"https://www.carrefour.com.ar",VEA:"https://www.vea.com.ar",CHANGOMAS:"https://www.masonline.com.ar"};
const object = (v: unknown): Record<string, any> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : null;
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length < 1000;
const price = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1e9;
const coordinates = (lat: unknown,lng: unknown): boolean => typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat)<=90 && Math.abs(lng)<=180 && (lat!==0||lng!==0);

export function parseRuntimeCatalog(raw: unknown, retailer: Retailer): Candidate[] {
  const root = object(raw);
  const payloads: unknown[] = root?.data ? [root.data] : [];
  if (Array.isArray(root?.queryData)) for (const row of root.queryData) {
    if (typeof row?.data === "string") try {payloads.push(JSON.parse(row.data));} catch { /* Solo JSON válido. */ }
  }
  const candidates: Candidate[] = [];
  for (const payload of payloads) {
    const products = object(object(payload)?.productSearch)?.products;
    if (!Array.isArray(products)) continue;
    for (const p of products.slice(0,48)) {
      if (!text(p?.productName) || !text(p.brand) || !text(p.link) || !Array.isArray(p.items)) continue;
      let url: URL;
      try {url = new URL(p.link,origins[retailer]);} catch {continue;}
      if (url.origin!==origins[retailer] || !url.pathname.endsWith("/p")) continue;
      for (const item of p.items.slice(0,10)) {
        if (!text(item?.itemId) || !Array.isArray(item.sellers)) continue;
        const seller = item.sellers.find((s:any)=>s?.sellerDefault===true) ?? (item.sellers.length===1 ? item.sellers[0] : null);
        const offer = object(seller?.commertialOffer);
        if (!text(seller?.sellerId) || !price(offer?.Price) || typeof offer.AvailableQuantity!=="number" || !Number.isFinite(offer.AvailableQuantity) || offer.AvailableQuantity<=0) continue;
        const ean = validEan(item.ean) ? item.ean : null;
        candidates.push({product:{ean,sku:item.itemId,name:p.productName.trim(),brand:p.brand.trim(),size:presentation(p.productName),url:url.href},
          price:offer.Price,listPrice:price(offer.ListPrice)?offer.ListPrice:null,onlineAvailable:true,sellerId:seller.sellerId,pickups:[]});
      }
    }
  }
  return [...new Map(candidates.map(c=>[`${c.product.ean??c.product.sku}:${c.sellerId}`,c])).values()];
}

export function parsePickupSimulation(raw: unknown, sku: string): Pickup[] {
  const data = object(raw);
  if (!Array.isArray(data?.items) || !Array.isArray(data.logisticsInfo) || !Array.isArray(data.pickupPoints)) return [];
  const index = data.items.findIndex((i:any)=>i?.id===sku && i.requestIndex===0);
  const item = data.items[index];
  if (!item || item.availability!=="available" || !price(item.sellingPrice) || !Number.isInteger(item.sellingPrice) || !Array.isArray(item.sellerChain)) return [];
  const seller = item.sellerChain.at(-1);
  if (!text(seller)) return [];
  const results: Pickup[]=[];
  for (const logistics of data.logisticsInfo.filter((l:any)=>l?.itemIndex===index)) {
    if (!Array.isArray(logistics.slas)) continue;
    for (const sla of logistics.slas) {
      if (sla?.deliveryChannel!=="pickup-in-point" || !text(sla.pickupPointId) || !sla.pickupPointId.startsWith(seller+"_")) continue;
      const point=data.pickupPoints.find((p:any)=>p?.id===sla.pickupPointId), a=point?.address;
      if (point?.isActive===false || !text(point?.friendlyName) || !text(a?.street) || !text(a?.number) || !text(a?.city) || a?.country!=="ARG" || !Array.isArray(a.geoCoordinates) || !coordinates(a.geoCoordinates[1],a.geoCoordinates[0])) continue;
      results.push({id:point.id,sellerId:seller,name:point.friendlyName.trim(),address:[a.street,a.number,a.city,a.state].filter(text).join(", "),
        latitude:a.geoCoordinates[1],longitude:a.geoCoordinates[0],price:item.sellingPrice/100,
        shippingEstimate:typeof sla.shippingEstimate==="string" && /^\d+(bd|d|h|m)$/.test(sla.shippingEstimate)?sla.shippingEstimate:null});
    }
  }
  return [...new Map(results.map(p=>[p.id,p])).values()];
}

// Cache DTO: solo campos comerciales que construyen nuestros parsers, sin sesión.
export function validProviderData(value: unknown, retailer: Retailer): value is ProviderData {
  const d=object(value);
  return d?.version===1 && d.retailer===retailer && typeof d.checkedAt==="string" && Number.isFinite(Date.parse(d.checkedAt)) &&
    Array.isArray(d.warnings) && d.warnings.every((w:unknown)=>typeof w==="string" && /^[A-Z0-9_:]+$/.test(w)) &&
    Array.isArray(d.candidates) && d.candidates.length<=3 && d.candidates.every((c:any)=>text(c?.product?.name) && text(c.product.brand) && text(c.product.sku) && (c.product.ean===null||validEan(c.product.ean)) &&
      (c.product.size===null||text(c.product.size)) && text(c.product.url) && c.product.url.startsWith(origins[retailer]+"/") && price(c.price) && text(c.sellerId) && c.onlineAvailable===true && Array.isArray(c.pickups) &&
      (retailer==="CARREFOUR"||c.pickups.length===0) && c.pickups.every((p:any)=>text(p?.id)&&text(p.sellerId)&&text(p.name)&&text(p.address)&&price(p.price)&&coordinates(p.latitude,p.longitude)));
}

export class RetailerHttpProvider implements LiveProvider {
  constructor(readonly retailer: Retailer, private readonly fetcher: typeof fetch = fetch) {}
  private async json(url: URL, signal: AbortSignal, body?: unknown) {
    const response=await this.fetcher(url,{method:body?"POST":"GET",redirect:"error",signal,headers:{accept:"application/json",...(body?{"content-type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    if (!response.headers.get("content-type")?.includes("json") || !response.body) throw new Error("INVALID_JSON");
    const reader=response.body.getReader(); const chunks: Uint8Array[]=[]; let length=0;
    try {for (;;) {const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>6*1024*1024)throw new Error("RESPONSE_TOO_LARGE");chunks.push(value);}}
    finally {await reader.cancel().catch(()=>{});}
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  }
  async search(input: LiveRequest, signal: AbortSignal): Promise<ProviderData> {
    const url=new URL(`/${encodeURIComponent(input.query.trim().toLowerCase())}`,origins[this.retailer]);
    url.search=new URLSearchParams({_q:input.query,map:"ft",__pickRuntime:"appsEtag,blocks,blocksTree,components,contentMap,extensions,messages,page,pages,query,queryData,route,runtimeMeta,settings",__device:"desktop"}).toString();
    const candidates=parseRuntimeCatalog(await this.json(url,signal),this.retailer).filter(c=>matchesLiveProduct(input.query,c.product,input.preferredEans)).slice(0,liveConfig().maxCandidates);
    const warnings:string[]=[];
    if (this.retailer==="CARREFOUR") {
      // Un máximo de tres SKU, sin crear carrito ni reservar. Un fallo de pickup
      // conserva los precios online y habilita la inferencia explícita.
      await Promise.allSettled(candidates.map(async c=>{
        if (!c.product.ean) return;
        try {c.pickups=parsePickupSimulation(await this.json(new URL("/api/checkout/pub/orderForms/simulation",origins.CARREFOUR),AbortSignal.any([signal,AbortSignal.timeout(2500)]),
          {items:[{id:c.product.sku,quantity:1,seller:c.sellerId}],geoCoordinates:[input.longitude,input.latitude],country:"ARG",postalCode:null}),c.product.sku);}
        catch(error) {logError(error,{intent:'SEARCH_PRODUCT',query:input.query,provider:this.retailer,stage:'pickup.simulation'});warnings.push("PICKUP_UNAVAILABLE");}
      }));
    }
    return {version:1,retailer:this.retailer,checkedAt:new Date().toISOString(),candidates,warnings:[...new Set(warnings)]};
  }
}
export class CarrefourLiveProvider extends RetailerHttpProvider {constructor(fetcher:typeof fetch=fetch){super("CARREFOUR",fetcher);}}
export class VeaLiveProvider extends RetailerHttpProvider {constructor(fetcher:typeof fetch=fetch){super("VEA",fetcher);}}
export class ChangoMasLiveProvider extends RetailerHttpProvider {constructor(fetcher:typeof fetch=fetch){super("CHANGOMAS",fetcher);}}
export const defaultLiveProviders = (): LiveProvider[] => [new CarrefourLiveProvider(),new VeaLiveProvider(),new ChangoMasLiveProvider()];
