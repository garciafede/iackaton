import { EcommercePlaywrightProvider } from "./playwright.provider.js";
import { parseVtexSearch } from "./vtex-parser.js";

export const parseCarrefour = (payload: unknown) => parseVtexSearch(payload, "https://www.carrefour.com.ar");
export class CarrefourPlaywrightProvider extends EcommercePlaywrightProvider {
  constructor() { super({ key: "CARREFOUR", origin: "https://www.carrefour.com.ar", searchName: /Qué estás buscando hoy/i, parse: parseCarrefour }); }
}
