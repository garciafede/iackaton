export type ProductTarget = {
  key: string; brand: string; name: string; variant: string; size: string;
  quantity: number; unit: "ml" | "g";
  eans: string[]; aliases: string[];
};

// EAN observados en SEPA 2026-09-07. Cada EAN se conserva como Product separado.
// Evidencia y diferencias de empaque: docs/PRICE-SOURCES.md.
export const productTargets: ProductTarget[] = [
  { key: "coca-zero-1500", brand: "Coca-Cola", name: "Coca-Cola Sin Azúcar", variant: "Sin Azúcar", size: "1.5 L", quantity: 1500, unit: "ml", eans: ["7790895067556"], aliases: ["coca zero", "coca sin azucar", "coca cola zero"] },
  { key: "oreo-118", brand: "Oreo", name: "Galletitas Oreo Original", variant: "Original", size: "118 g", quantity: 118, unit: "g", eans: ["7622201735296", "7622201735272"], aliases: ["oreo", "oreo original", "galletitas oreo"] },
  { key: "playadito-1000", brand: "Playadito", name: "Yerba Mate Playadito Suave", variant: "Suave con palo", size: "1 kg", quantity: 1000, unit: "g", eans: ["7793704000928"], aliases: ["playadito", "yerba playadito", "playadito 1 kg"] },
  { key: "pepsi-black-1500", brand: "Pepsi", name: "Pepsi Black", variant: "Black / Sin Azúcar", size: "1.5 L", quantity: 1500, unit: "ml", eans: ["7791813828419", "7791813421054"], aliases: ["pepsi black", "pepsi sin azucar", "pepsi zero"] },
  { key: "gallo-oro-1000", brand: "Gallo", name: "Arroz Gallo Oro", variant: "Parboil", size: "1 kg", quantity: 1000, unit: "g", eans: ["7790070431417", "7790070433091"], aliases: ["gallo oro", "arroz gallo oro", "gallo parboil"] },
];

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

export function selectedTargets(filter?: string): ProductTarget[] {
  if (!filter) return productTargets;
  const query = filter.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  const matches = productTargets.filter((p) => [p.key, p.name, ...p.eans, ...p.aliases].some((v) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase() === query));
  if (!matches.length) throw new Error("El producto solicitado no está en la configuración de precios.");
  return matches;
}

// El empaque es distinto aunque ambas presentaciones pertenezcan al mismo grupo.
export const eanVariants: Record<string, string> = {
  "7790070431417": "Parboil, bolsa",
  "7790070433091": "Parboil, caja",
};
