import { EcommercePlaywrightProvider } from "./playwright.provider.js";
import { parseJsonLdProducts } from "./jsonld-parser.js";

export const parseChangoMas = (payload: unknown) => parseJsonLdProducts(payload, "https://www.masonline.com.ar");
export class ChangoMasPlaywrightProvider extends EcommercePlaywrightProvider {
  constructor() { super({ key: "CHANGOMAS", origin: "https://www.masonline.com.ar", searchName: /Qué estás buscando/i, parse: parseChangoMas, structured: true }); }
}
