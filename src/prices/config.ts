import { catalogProducts, type CatalogProduct } from "../catalog/products.js";
export type ProductTarget = CatalogProduct;
export const productTargets = catalogProducts.filter((product) => product.enabled);

// El refresh web predeterminado sigue limitado a los cinco grupos originales.
export const playwrightSmokeProductKeys = ["coca-zero-1500", "oreo-118", "playadito-1000", "pepsi-black-1500", "gallo-oro-1000"];

export const priceConfig = {
  sepaCatalogUrl: "https://datos.produccion.gob.ar/dataset/sepa-precios",
  cacheDirectory: ".cache/prices/sepa",
  // Orden de prioridad; hasta 8 sucursales por cadena/provincia (máximo 96).
  provinces: ["AR-T", "AR-X", "AR-C", "AR-B"],
  maxStoresPerChainProvince: 8,
  maxSourceAgeDays: 7,
  chains: [
    { key: "carrefour", name: "Carrefour", commerceId: "10", flags: ["1", "2", "3", "4"] },
    { key: "vea", name: "Vea", commerceId: "9", flags: ["1"] },
    { key: "changomas", name: "ChangoMás", commerceId: "11", flags: ["1", "2", "3", "4", "5"] },
  ],
};

export function selectedTargets(filter?: string, options: { category?: string; all?: boolean; forPlaywright?: boolean } = {}): ProductTarget[] {
  if ([Boolean(filter), Boolean(options.category), Boolean(options.all)].filter(Boolean).length > 1) throw new Error("Elegir solo --product, --category o --all.");
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  if (options.category) {
    const matches = productTargets.filter((p) => normalize(p.category) === normalize(options.category!));
    if (!matches.length) throw new Error("Categoría no encontrada en el catálogo habilitado.");
    return matches;
  }
  if (!filter) return options.forPlaywright && !options.all ? productTargets.filter((p) => playwrightSmokeProductKeys.includes(p.key)) : productTargets;
  const query = normalize(filter);
  const matches = productTargets.filter((p) => [p.key, p.name, `${p.name} ${p.size}`, ...p.eans, ...p.aliases].some((v) => normalize(v) === query));
  if (!matches.length) throw new Error("El producto solicitado no está en la configuración de precios.");
  return matches;
}

// El empaque es distinto aunque ambas presentaciones pertenezcan al mismo grupo.
export const eanVariants: Record<string, string> = Object.assign({}, ...productTargets.map((product) => product.eanVariants ?? {}));
