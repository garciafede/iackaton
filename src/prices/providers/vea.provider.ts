import { EcommercePlaywrightProvider } from "./playwright.provider.js";
import { parseJsonLdProducts } from "./jsonld-parser.js";

export const parseVea = (payload: unknown) => parseJsonLdProducts(payload, "https://www.vea.com.ar");
export class VeaPlaywrightProvider extends EcommercePlaywrightProvider {
  // El nombre con placeholder aparece después de hidratar; el textbox SSR
  // llamado solo "Buscar Productos" todavía no procesa Enter.
  constructor() { super({ key: "VEA", origin: "https://www.vea.com.ar", searchName: /Qué estás buscando/i, parse: parseVea, structured: true }); }
}
