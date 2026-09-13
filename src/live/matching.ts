import {normalizeCatalogText} from "../catalog/matching.js";
import type {LiveProduct} from "./types.js";
import {catalogProducts} from "../catalog/products.js";
import {presentationMatches} from "../prices/matching.js";

export function validEan(value: unknown): value is string {
  if (typeof value !== "string" || !/^(?:\d{8}|\d{12,14})$/.test(value)) return false;
  const digits = [...value].map(Number), check = digits.pop()!;
  return (10 - digits.reverse().reduce((sum,n,i)=>sum+n*(i%2 ? 1:3),0)%10)%10 === check;
}
export function presentation(text: string): string | null {
  const normalized = normalizeCatalogText(text);
  const sizes = [...normalized.matchAll(/\b(\d+(?:\.\d+)?)\s+(ml|g|unidades)\b/g)].map(m=>`${m[1]} ${m[2]}`);
  return new Set(sizes).size === 1 ? sizes[0]! : null;
}
const ignore = new Set(["buscame","busca","buscar","quiero","necesito","dame","el","la","los","las","un","una","de","del","con","por","favor","me","en","mas","barata","barato","cercana","cercano"]);
export function matchesLiveProduct(query: string, product: LiveProduct, preferredEans?: string[]): boolean {
  if (preferredEans?.length) {
    const target=catalogProducts.find(p=>product.ean && p.eans.includes(product.ean));
    return !!product.ean && preferredEans.includes(product.ean) && (!target || presentationMatches(product.name,target));
  }
  if (/^\d{8,14}$/.test(query.trim())) return product.ean === query.trim();
  const normalized = normalizeCatalogText(query);
  const name = normalizeCatalogText(`${product.name} ${product.brand}`);
  if (/\b(pack|combo|duo)\b|\b[2-9]\s*x\s*\d/.test(name) && !/\b(pack|combo|duo)\b/.test(normalized)) return false;
  const wantedSize = presentation(query);
  if (wantedSize && wantedSize !== product.size) return false;
  const words = normalized.split(" ").filter(w=>w && !ignore.has(w));
  if (!words.length || !words.every(w=>name.split(" ").includes(w))) return false;
  // Una identidad sin EAN exige al menos marca y presentación explícitas.
  if (!product.ean && (!wantedSize || !normalizeCatalogText(product.brand).split(" ").every(w=>normalized.split(" ").includes(w)))) return false;
  // Si ya se indicó una variante concreta, no ampliarla con calificadores distintos.
  if (/\bultra\s+limon\b/.test(normalized) && !/\bcremoso\b/.test(normalized) && /\bcremoso\b/.test(name)) return false;
  return true;
}
