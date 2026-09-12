export type CatalogCandidate = {
  ean: string | null; name: string; brand: string; sku: string | null;
  price: string | null; regularPrice: string | null; stock: boolean | null; url: string;
};

const record = (value: unknown): Record<string, any> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1e10 ? value.toFixed(2) : null;

// Campos observados con Playwright CLI en productSearchV3 de Carrefour.
// Solo precios del SKU/seller, nunca priceRange ni descuentos condicionados.
export function parseVtexSearch(payload: unknown, origin: string): CatalogCandidate[] {
  const products = record(record(record(payload)?.data)?.productSearch)?.products;
  if (!Array.isArray(products)) return [];
  return products.flatMap((raw): CatalogCandidate[] => {
    const p = record(raw);
    if (!p || typeof p.productName !== "string" || typeof p.link !== "string" || !Array.isArray(p.items)) return [];
    let url: URL;
    try { url = new URL(p.link, origin); } catch { return []; }
    if (url.origin !== new URL(origin).origin || !url.pathname.endsWith("/p")) return [];
    return p.items.flatMap((item: unknown): CatalogCandidate[] => {
      const sku = record(item);
      if (!sku || !Array.isArray(sku.sellers)) return [];
      // No elegir el menor precio de vendedores distintos: solo seller por defecto.
      const seller = sku.sellers.find((s: any) => s?.sellerDefault === true) ?? (sku.sellers.length === 1 ? sku.sellers[0] : null);
      const offer = record(record(seller)?.commertialOffer);
      if (!offer) return [];
      const quantity = offer.AvailableQuantity;
      return [{ ean: typeof sku.ean === "string" && /^\d{8,14}$/.test(sku.ean) ? sku.ean : null,
        name: p.productName, brand: typeof p.brand === "string" ? p.brand : "", sku: typeof sku.itemId === "string" ? sku.itemId : null,
        price: amount(offer.Price), regularPrice: amount(offer.ListPrice),
        stock: typeof quantity === "number" && Number.isFinite(quantity) && quantity >= 0 ? quantity > 0 : null,
        url: url.href,
      }];
    });
  });
}
