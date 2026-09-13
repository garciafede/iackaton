import { normalizeSearchText } from "../utils/normalize-text.js";
import type { SearchSort } from "../services/product-search.service.js";

export type PreviousSearch = { query: string; sort: SearchSort; radiusKm?: number | null };
const clean = (message: string) => normalizeSearchText(message).replace(/[¿?¡!.,]/g, "").trim();
export const isGreeting = (message: string) => /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches)$/.test(clean(message));

// Solo seguimientos inequívocos: una consulta que nombra otro producto pasa al agente.
export function followupSort(message: string): SearchSort | undefined {
  const text = clean(message);
  if (/^(?:(?:ahora )?(?:quiero|buscame|mostrame|dame) )?(?:la |el )?mas barat[ao]$/.test(text)) return "price";
  if (/^(?:(?:ahora )?(?:quiero|buscame|mostrame|dame) )?(?:la |el )?mas cercan[ao]$/.test(text)) return "distance";
  return undefined;
}
