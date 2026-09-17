import { normalizeSearchText } from "../utils/normalize-text.js";
import type { SearchSort } from "../services/product-search.service.js";
import type { SearchResult } from "../services/product-search.service.js";

export type PreviousSearch = { query: string; sort: SearchSort; radiusKm?: number | null };
const clean = (message: string) => normalizeSearchText(message).replace(/[¿?¡!.,]/g, "").trim();
export const isGreeting = (message: string) => /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches)$/.test(clean(message));
export const isFarewell = (message:string) => /^(?:pesima demo\s+)?(?:(?:nada mas|eso es todo|listo)\s+)?(?:(?:muchas |mil )?gracias(?: por (?:todo|la ayuda))?|adios|chau|chao|hasta luego|hasta pronto|nos vemos)(?:\s+(?:(?:muchas |mil )?gracias|adios|chau|chao|hasta luego|hasta pronto|nos vemos))*$/.test(clean(message));
export const isCartFollowup = (message:string) => /^(?:(?:y )?el carrito(?: con (?:esta|mi|la nueva) ubicacion)?|(?:recalcula|recalcular|actualiza|compara)(?:me)? (?:el |mi )?carrito(?: ahora)?|donde (?:me )?conviene comprar (?:el |mi )carrito(?: ahora)?|cuanto gastaria en cada supermercado|de lo anterior que te mande|(?:y )?(?:ahora )?con el (?:carro|carrito) anterior donde (?:me )?conviene comprar(?: por cercania)?|volviendo a la compra anterior cual es la mas barata|(?:el |mi )?(?:carro|carrito|compra anterior|lo anterior))$/.test(clean(message));

export function requestedSort(message: string): SearchSort | undefined {
  const text = clean(message);
  const matches = [...text.matchAll(/mas barat[ao]s?|donde(?: me)? conviene|menor precio|por precio|priorizo el precio|cuanto gastaria en cada supermercado|que supermercado me conviene para comprar todo|mas cerca(?:n[ao]s?)?|por cercania|recomendad[ao]/g)];
  const last = matches.at(-1)?.[0];
  return last ? /cerca/.test(last) ? "distance" : /recomendad/.test(last) ? "recommended" : "price" : undefined;
}
export const wantsDetails = (message: string) => /\b(fuentes?|ean|timestamps?|fecha|detalles?|verificacion)\b/.test(clean(message));

export function answerStoreQuestion(message:string,results:SearchResult[]):string|undefined {
  const text=clean(message);
  if(!/\bmas cerca\b/.test(text))return undefined;
  const chain=text.match(/\b(carrefour|vea|changomas)\b/)?.[1];
  if(!chain)return undefined;
  const street=text.match(/el de (?:la |el )?(.+)$/)?.[1];
  const rows=results.filter(r=>Number.isFinite(r.distanceKm)).sort((a,b)=>a.distanceKm-b.distanceKm);
  const target=rows.find(r=>clean(r.store.chain??"").replace(/\s/g,"")===chain&&(!street||clean(r.store.address+" "+r.store.name).includes(street)));
  if(!target)return "Esa sucursal no aparece en los resultados actuales del producto o carrito. No puedo confirmar su precio ni compararla con esos datos.";
  const km=(n:number)=>n.toLocaleString("es-AR",{maximumFractionDigits:2});
  const nearest=rows[0]!;
  return [`${target.store.name} · ${target.store.address}: ${km(target.distanceKm)} km.`,nearest.distanceKm<target.distanceKm?`Entre los resultados actuales, ${nearest.store.name} queda más cerca: ${km(nearest.distanceKm)} km.`:"Sí, está entre las opciones más cercanas de los resultados actuales.","La distancia no confirma disponibilidad local."].join("\n");
}

// Solo seguimientos inequívocos: una consulta que nombra otro producto pasa al agente.
export function followupSort(message: string): SearchSort | undefined {
  const text = clean(message).replace(/^y\s+/, "");
  if (/^volvamos a (?:la |el )?(?:mas )?barat[ao]$/.test(text)) return "price";
  if (/^(?:por precio|priorizo el precio|cual opcion me conviene si priorizo el precio|el que te dije recien)$/.test(text)) return "price";
  if (/^(?:cual|que supermercado|que cadena) (?:me |nos )?queda mas cerca$/.test(text)) return "distance";
  if (/^(?:(?:ahora )?(?:quiero|buscame|mostrame|dame) )?(?:la |el |las |los )?(?:mas barat[ao]s?|menor precio|donde conviene|donde es mas barato)$/.test(text)) return "price";
  if (/^(?:(?:ahora )?(?:quiero|buscame|mostrame|dame) )?(?:la |el )?mas barat[ao]$/.test(text)) return "price";
  if (/^(?:(?:ahora )?(?:quiero|buscame|mostrame|dame) )?(?:la |el )?mas cercan[ao]$/.test(text)) return "distance";
  return undefined;
}
