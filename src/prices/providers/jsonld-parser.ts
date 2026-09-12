import type { CatalogCandidate } from "./vtex-parser.js";

// Vea publica ItemList -> ListItem.item -> Product -> AggregateOffer.offers.
// mpn y sku no son EAN. No convertirlos en códigos de barras.
export function parseJsonLdProducts(payload: unknown, origin: string): CatalogCandidate[] {
  if (Array.isArray(payload)) return payload.flatMap((p) => parseJsonLdProducts(p, origin));
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, any>;
  if (p["@graph"]) return parseJsonLdProducts(p["@graph"], origin);
  if (p["@type"] === "ItemList") return (Array.isArray(p.itemListElement) ? p.itemListElement : []).flatMap((e: any) => parseJsonLdProducts(e?.item, origin));
  if (p["@type"] !== "Product" || typeof p.name !== "string") return [];
  const offers = p.offers?.["@type"] === "AggregateOffer" ? p.offers.offers : [p.offers];
  if (!Array.isArray(offers) || offers.length !== 1) return [];
  const offer = offers[0];
  const price = Number(offer?.price);
  if (!offer || offer.priceCurrency !== "ARS" || !Number.isFinite(price) || price <= 0 || price >= 1e10) return [];
  let url: URL;
  try { url = new URL(p.url ?? p["@id"], origin); } catch { return []; }
  if (url.origin !== new URL(origin).origin || !url.pathname.endsWith("/p")) return [];
  const ean = p.gtin13 ?? p.gtin ?? p.gtin8;
  return [{ ean: typeof ean === "string" && /^\d{8,14}$/.test(ean) ? ean : null,
    name: p.name, brand: typeof p.brand === "string" ? p.brand : p.brand?.name ?? "", sku: typeof p.sku === "string" ? p.sku : null,
    price: price.toFixed(2), regularPrice: null,
    stock: /\/InStock$/.test(offer.availability ?? "") ? true : /\/(?:OutOfStock|SoldOut)$/.test(offer.availability ?? "") ? false : null,
    url: url.href,
  }];
}
