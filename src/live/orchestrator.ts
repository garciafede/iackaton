import {searchProductOffers,findBestProduct,sortSearchResults,type SearchResult,type SearchSort} from "../services/product-search.service.js";
import {catalogProducts} from "../catalog/products.js";
import {normalizeCatalogText} from "../catalog/matching.js";
import {addRecommendations,assessOfferQuality,offerQualityConfig,resolveRadiusKm} from "../services/offer-quality.js";
import {defaultLiveProviders,validProviderData} from "./providers.js";
import {liveConfig,liveEnabled} from "./config.js";
import {liveCacheKey,neonLiveRepository,type LiveRepository} from "./repository.js";
import {mapLiveCandidates} from "./store-mapping.js";
import {retailers,type LiveProvider,type LiveRequest,type ProviderData,type ProviderReport,type Retailer} from "./types.js";
import {logError} from '../lib/safe-logging.js';

type StableResponse=NonNullable<Awaited<ReturnType<typeof searchProductOffers>>>;
export type SearchResponse=Omit<StableResponse,"results"> & {results:SearchResult[];notices?:string[];liveReports?:ProviderReport[];multipleProducts?:boolean};
export type OrchestratorDependencies={providers:LiveProvider[];repository:LiveRepository;fallback:typeof searchProductOffers;now:()=>Date};
type Options={enabled?:boolean;cache?:boolean;persist?:boolean;timeoutMs?:number;onReport?:(report:ProviderReport)=>void};
const pending=new Map<string,Promise<ProviderData>>();
export async function bounded<T>(work:Promise<T>,ms:number,onTimeout?:()=>void):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{onTimeout?.();reject(new Error("TIMEOUT"));},ms);})]);}
  finally {if(timer)clearTimeout(timer);}
}
function preferredEans(query:string):string[]|undefined {
  const enabled=catalogProducts.filter(p=>p.enabled);
  const exact=enabled.find(p=>p.eans.includes(query.trim()));
  if (exact) return [query.trim()];
  const found=findBestProduct(query,enabled.map((p,i)=>({id:i,ean:p.eans[0]!,name:p.name,brand:p.brand,variant:p.variant,size:p.size,aliases:p.aliases.map(alias=>({alias}))}))) ;
  return found ? enabled[found.id]!.eans : undefined;
}
const safeWarning=(error:unknown)=>error instanceof Error && /^(TIMEOUT|HTTP_\d{3}|INVALID_JSON|RESPONSE_TOO_LARGE)$/.test(error.message)?error.message:"PROVIDER_UNAVAILABLE";

export class ProductSearchOrchestrator {
  constructor(private readonly deps:OrchestratorDependencies={providers:defaultLiveProviders(),repository:neonLiveRepository,fallback:searchProductOffers,now:()=>new Date()}) {}
  async search(query:string,latitude:number,longitude:number,sort:SearchSort,radiusKm:number|null=offerQualityConfig.defaultRadiusKm,options:Options={}):Promise<SearchResponse|null> {
    // OFF no consulta caché, providers ni sucursales adicionales; misma respuesta estable.
    if (!(options.enabled??liveEnabled())) return this.deps.fallback(query,latitude,longitude,sort,radiusKm);
    const radius=resolveRadiusKm(radiusKm);
    if (!query.trim()||query.length>200||![latitude,longitude].every(Number.isFinite)||Math.abs(latitude)>90||Math.abs(longitude)>180||!["price","distance","recommended"].includes(sort)) throw new Error("Búsqueda inválida");
    const preferred=preferredEans(query);
    const input:LiveRequest={query:query.trim(),latitude,longitude,radiusKm:radius,...(preferred?{preferredEans:preferred}:{})};
    const now=this.deps.now(),config=liveConfig();
    const fallbackPromise=bounded(this.deps.fallback(query,latitude,longitude,sort,radius),4000).catch(error=>{logError(error,{intent:'SEARCH_PRODUCT',query,provider:'SEPA',stage:'fallback.search'});return null;});
    const branchesPromise=bounded(this.deps.repository.branches(),3000).catch(error=>{logError(error,{intent:'SEARCH_PRODUCT',query,stage:'branches.read'});return [];});
    const reports:ProviderReport[]=[];
    const outcomes=await Promise.allSettled(this.deps.providers.map(async provider=>{
      const start=Date.now(),key=liveCacheKey(provider.retailer,input),warnings:string[]=[];
      let cache:ProviderReport["cache"]=options.cache===false?"DISABLED":"MISS";
      try {
        let data:ProviderData|undefined;
        if(options.cache!==false) {
          try {
            const value=await bounded(this.deps.repository.read(key,new Date(now.getTime()-config.ttlMinutes*60000)),1500);
            if(validProviderData(value,provider.retailer)) {
              const age=now.getTime()-Date.parse(value.checkedAt);
              if(age>=0&&age<config.ttlMinutes*60000) {data=value;cache="HIT";}
            }
          } catch(error) {logError(error,{intent:'SEARCH_PRODUCT',query,provider:provider.retailer,stage:'cache.read'});warnings.push("CACHE_READ_UNAVAILABLE");}
        }
        if(!data) {
          // Coalescer solo durante una request concurrente; TTL/histórico residen en Neon.
          let work=pending.get(key);
          if(!work) {
            const controller=new AbortController();
            work=bounded(provider.search(input,controller.signal),options.timeoutMs??config.timeoutMs,()=>controller.abort());
            pending.set(key,work);
            void work.finally(()=>{if(pending.get(key)===work)pending.delete(key);}).catch(()=>{});
          }
          data=await work;
          if(!validProviderData(data,provider.retailer)||Date.parse(data.checkedAt)>this.deps.now().getTime()+1000) throw new Error("INVALID_JSON");
          if(options.persist!==false) try {await bounded(this.deps.repository.save(key,data),3500);} catch(error) {logError(error,{intent:'SEARCH_PRODUCT',query,provider:provider.retailer,stage:'cache.write'});warnings.push("CACHE_WRITE_UNAVAILABLE");}
        }
        warnings.push(...data.warnings);
        if(!data.candidates.length)warnings.push("NO_MATCHING_PRODUCT");
        reports.push({retailer:provider.retailer,status:warnings.length?"WARN":"OK",durationMs:Date.now()-start,cache,candidates:data.candidates.length,warnings:[...new Set(warnings)]});
        return data;
      } catch(error) {
        warnings.push(safeWarning(error));
        reports.push({retailer:provider.retailer,status:"WARN",durationMs:Date.now()-start,cache,candidates:0,warnings});
        logError(error,{intent:'SEARCH_PRODUCT',query,provider:provider.retailer,stage:'provider.search'});
        throw new Error("PROVIDER_UNAVAILABLE");
      }
    }));
    const [fallback,branches]=await Promise.all([fallbackPromise,branchesPromise]);
    const notices:string[]=[];
    const live=outcomes.flatMap(outcome=>{
      if(outcome.status!=="fulfilled")return [];
      const mapped=mapLiveCandidates(outcome.value,branches,input,this.deps.now());
      notices.push(...mapped.notices);
      if(mapped.notices.length) {const report=reports.find(r=>r.retailer===outcome.value.retailer)!;report.status="WARN";report.warnings.push("NO_NEARBY_BRANCH");}
      return mapped.results;
    });
    // EAN contradictorio entre fuentes: no mezclar ni seleccionar el precio menor.
    const identities=new Map<string,Set<string>>();
    for(const r of live) if(r.product?.ean) {
      const values=identities.get(r.product.ean)??new Set();
      values.add(normalizeCatalogText(`${r.product.brand} ${r.product.size??""}`));identities.set(r.product.ean,values);
    }
    const verifiedLive=live.filter(r=>!r.product?.ean||identities.get(r.product.ean)!.size===1);
    if(verifiedLive.length<live.length)notices.push("Se omitieron resultados con identidad contradictoria entre fuentes.");
    const stable=(fallback?.results??[]).filter(r=>!verifiedLive.length||r.source!=="DEMO").map((r):SearchResult=>{
      if(r.source!=="REAL:SEPA")return r;
      const retailer=(Object.keys(retailers) as Retailer[]).find(k=>retailers[k]===r.store.chain);
      return retailer?{...r,live:{retailer,priceScope:"SEPA_BRANCH",storeMappingMethod:"SEPA_REPORTED",availability:"UNCONFIRMED",availabilityConfidence:"UNCONFIRMED_AT_STORE",fulfillment:"UNKNOWN",onlineAvailable:false}}:r;
    });
    const combined=[...stable];
    for(const r of verifiedLive) {
      const same=combined.findIndex(s=>s.store.id>0&&s.store.id===r.store.id&&s.product?.ean===r.product?.ean&&s.live?.priceScope!=="ONLINE_CHAIN");
      if(r.live.priceScope==="BRANCH_CONFIRMED"&&same>=0) {if(r.lastCheckedAt>=combined[same]!.lastCheckedAt)combined[same]=r;}
      else if(!combined.some(s=>s.source===r.source&&s.product?.ean===r.product?.ean&&s.live?.sku===r.live.sku&&s.store.id===r.store.id&&s.store.externalId===r.store.externalId))combined.push(r);
    }
    const ranked=addRecommendations(combined.map(r=>({...r,quality:r.quality??assessOfferQuality({source:r.source,stock:r.stock,lastCheckedAt:r.lastCheckedAt,storeIdentified:r.store.id>0},now)})))
      .map(r=>({...r,recommendation:{...r.recommendation,score:r.recommendation.score+(r.live?.priceScope==="BRANCH_CONFIRMED"?20:r.live?.priceScope==="SEPA_BRANCH"?10:0)}}));
    const results=sortSearchResults(ranked,sort);
    const first=outcomes.find(o=>o.status==="fulfilled"&&o.value.candidates.length);
    const product=first?.status==="fulfilled"?first.value.candidates[0]?.product:null;
    for(const report of reports)options.onReport?.(report);
    if(!fallback&&!product)return null;
    const multipleProducts=new Set(results.map(r=>r.product?.ean??`${r.source}:${r.live?.sku}`)).size>1&&!preferred;
    const canExpand=!results.length&&radius!==null&&(notices.length>0||fallback?.canExpandRadius===true);
    return {product:fallback?.product??{id:0,name:multipleProducts?`Variantes de ${query}`:product!.name,brand:product!.brand,size:null,variant:null},
      totalResults:results.length,results,radiusKm:radius,evaluatedAt:now,status:results.length?"OK":canExpand?"NO_OFFERS_WITHIN_RADIUS":"NO_ELIGIBLE_OFFERS",
      outsideRadiusCount:fallback?.outsideRadiusCount??0,canExpandRadius:canExpand,suggestedRadiusKm:canExpand&&radius<offerQualityConfig.maxRadiusKm?Math.min(offerQualityConfig.maxRadiusKm,radius*2):null,
      notices:[...new Set(notices)],liveReports:reports.sort((a,b)=>a.retailer.localeCompare(b.retailer)),multipleProducts};
  }
}
export const productSearchOrchestrator=new ProductSearchOrchestrator();
export const searchWithLiveOffers=(query:string,latitude:number,longitude:number,sort:SearchSort,radiusKm?:number|null)=>productSearchOrchestrator.search(query,latitude,longitude,sort,radiusKm);
