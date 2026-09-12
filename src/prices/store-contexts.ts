import type { PriceObservation } from "./types.js";

export type StoreContextMapping = {
  // Selector y texto exactos de la sucursal seleccionada, observados en el sitio.
  selector: string;
  expectedText: string;
  evidence: string; // Archivo/URL que prueba la correspondencia con SEPA.
  store: NonNullable<PriceObservation["store"]>;
};

// Vacío a propósito: las tres sesiones públicas piden login para elegir entrega.
// Completar SOLO con una correspondencia comprobada. Copiar la identidad exacta
// de Store/SEPA (chain, name, address, coordenadas); no inventar ni usar solo CP.
// Una coincidencia del seller o del canal online no demuestra una sucursal.
export const ecommerceStoreContexts: Record<string, StoreContextMapping | undefined> = {};

export function matchesStoreContext(observedTexts: string[], mapping: StoreContextMapping) {
  const clean = (value: string) => value.replace(/\s+/g, " ").trim();
  return Boolean(mapping.evidence.trim() && mapping.expectedText.trim() && observedTexts.length === 1 && clean(observedTexts[0]!) === clean(mapping.expectedText));
}
