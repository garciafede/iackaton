import {calculateDistanceKm} from "../utils/distance.js";
import {normalizeCatalogText} from "../catalog/matching.js";
import {classifyFreshness} from "../services/offer-quality.js";
import {retailers,type Branch,type Candidate,type LiveRequest,type LiveResult,type ProviderData} from "./types.js";

export function realBranch(branch:Branch):boolean {
  return branch.id>0 && branch.source.startsWith("REAL:") && !!branch.name.trim() && !!branch.address.trim() &&
    !/\bdemo\b/i.test(branch.name+" "+branch.chain+" "+branch.address) && Number.isFinite(branch.latitude) && Number.isFinite(branch.longitude) &&
    Math.abs(branch.latitude)<=90 && Math.abs(branch.longitude)<=180 && (branch.latitude!==0||branch.longitude!==0);
}
export function nearestBranch(branches:Branch[], chain:string,input:LiveRequest):Branch|null {
  return branches.filter(b=>b.chain===chain && realBranch(b)).map(branch=>({branch,distance:calculateDistanceKm(input,branch)}))
    .filter(x=>input.radiusKm===null||x.distance<=input.radiusKm).sort((a,b)=>a.distance-b.distance||a.branch.id-b.branch.id)[0]?.branch??null;
}
export function mapLiveCandidates(data:ProviderData,branches:Branch[],input:LiveRequest,now:Date):{results:LiveResult[];notices:string[]} {
  const chain=retailers[data.retailer],results:LiveResult[]=[],notices:string[]=[];
  const candidateBranch=nearestBranch(branches,chain,input);
  for(const c of data.candidates) {
    if (!c.onlineAvailable) continue;
    const pickups=data.retailer==="CARREFOUR" ? c.pickups.filter(p=>input.radiusKm===null||calculateDistanceKm(input,p)<=input.radiusKm).sort((a,b)=>calculateDistanceKm(input,a)-calculateDistanceKm(input,b)) : [];
    const pickup=pickups[0];
    if (!pickup && !candidateBranch) {
      notices.push(`No encontré una sucursal cercana de ${chain}. Precio online detectado; no se asoció a una sucursal fuera del radio.`);
      continue;
    }
    const existing=pickup ? branches.find(b=>b.chain===chain && realBranch(b) && calculateDistanceKm(b,pickup)<0.2 &&
      // Coordenadas cercanas no bastan: conservar además calle y número compartidos.
      normalizeCatalogText(pickup.address.split(",").slice(0,2).join(" ")).split(" ").every(w=>normalizeCatalogText(b.address).split(" ").includes(w))) : candidateBranch;
    const store=pickup ? {id:existing?.id??0,chain,name:`${chain} ${pickup.name}`,address:pickup.address,latitude:pickup.latitude,longitude:pickup.longitude,externalId:pickup.id}
      : {id:candidateBranch!.id,chain,name:candidateBranch!.name,address:candidateBranch!.address,latitude:candidateBranch!.latitude,longitude:candidateBranch!.longitude};
    const checkedAt=new Date(data.checkedAt);
    results.push({store,price:pickup?.price??c.price,distanceKm:calculateDistanceKm(input,store),stock:null,
      product:{id:0,ean:c.product.ean,name:c.product.name,brand:c.product.brand,variant:null,size:c.product.size},source:`REAL:LIVE:${data.retailer}`,lastCheckedAt:checkedAt,
      availability:pickup?"PICKUP_AVAILABLE":"ASSUMED_NEAREST_BRANCH",
      live:{retailer:data.retailer,priceScope:pickup?"BRANCH_CONFIRMED":"ONLINE_CHAIN",storeMappingMethod:pickup?"EXACT_PICKUP":"NEAREST_BRANCH_ASSUMPTION",
        availability:pickup?"PICKUP_AVAILABLE":"ASSUMED_NEAREST_BRANCH",availabilityConfidence:pickup?"CONFIRMED_FOR_PICKUP":"UNCONFIRMED_AT_STORE",fulfillment:pickup?"PICKUP":"UNKNOWN",
        onlineAvailable:true,sku:c.product.sku,productUrl:c.product.url,sellerId:pickup?.sellerId??c.sellerId,...(pickup?{pickupPointId:pickup.id,...(pickup.shippingEstimate?{shippingEstimate:pickup.shippingEstimate}:{})}:{})},
      quality:{...classifyFreshness(checkedAt,now),confidence:pickup?"HIGH":"LOW",storeIdentified:!!pickup,
        confidenceReasons:pickup?["SKU y punto de retiro vinculados por simulación; góndola no confirmada"]:["Sucursal real más cercana de la misma cadena; precio y disponibilidad en ese local no confirmados"]},
    });
  }
  return {results,notices:[...new Set(notices)]};
}
