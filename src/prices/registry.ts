import type { PriceProvider } from "./types.js";
import { SepaPriceProvider } from "./providers/sepa.provider.js";
import { CarrefourPlaywrightProvider } from "./providers/carrefour.provider.js";
import { VeaPlaywrightProvider } from "./providers/vea.provider.js";
import { ChangoMasPlaywrightProvider } from "./providers/changomas.provider.js";

// Agregar una cadena requiere provider + registro. Nunca tocar WhatsApp.
export const priceProviders: Record<string, () => PriceProvider> = {
  sepa: () => new SepaPriceProvider(),
  carrefour: () => new CarrefourPlaywrightProvider(),
  vea: () => new VeaPlaywrightProvider(),
  changomas: () => new ChangoMasPlaywrightProvider(),
};
export const ecommerceProviders = ["carrefour", "vea", "changomas"];
