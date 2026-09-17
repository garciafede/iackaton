import {deduplicateOffers,type SearchResult,type SearchSort} from "../services/product-search.service.js";
import {normalizeCatalogText} from '../catalog/matching.js';
const money=(n:number)=>n.toLocaleString("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2});
const clean=(s:string)=>s.replace(/[\r\n*_`~]/g," ").trim();
export function formatCompactOffers(data:{product:{name:string;size:string|null};results:SearchResult[]},sort:SearchSort):string {
  const rows=deduplicateOffers(data.results).slice(0,3);
  const heading=sort==="price"?"Menor precio":sort==="distance"?"Más cerca":"Recomendadas";
  const title=`${clean(data.product.name)} ${clean(data.product.size??"")}`.trim();
  const lines=rows.map((r,i)=>{
    const label=`${clean(r.product?.name??data.product.name)} ${clean(r.product?.size??data.product.size??"")}`.trim();
    return `${i+1}. ${clean(r.store.name)} — $${money(r.price)} · ${r.distanceKm.toLocaleString("es-AR",{maximumFractionDigits:2})} km${r.live?.priceScope==="BRANCH_CONFIRMED"?" · retiro disponible":""}${r.source==="DEMO"?" · DEMO":""}${normalizeCatalogText(label)!==normalizeCatalogText(title)?`\n${label}`:""}`;
  });
  const online=rows.some(r=>r.live?.priceScope==="ONLINE_CHAIN");
  const pickup=rows.some(r=>r.live?.priceScope==="BRANCH_CONFIRMED");
  return [`*${clean(data.product.name)} ${clean(data.product.size??"")}*`,`${heading}:`,...lines,online?"*Precio online; precio y disponibilidad local no confirmados.":pickup?"*Compra online con retiro; disponibilidad en góndola no confirmada.":"*Precio relevado; disponibilidad no confirmada."].join("\n");
}
