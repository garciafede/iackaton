import { normalizeSearchText } from "../utils/normalize-text.js";

// Unificar magnitudes para que 1,5 L y 1500 ml sean la misma presentación.
export function normalizeCatalogText(value: string) {
  return normalizeSearchText(value.replace(/(\d),(?=\d)/g, "$1.")
    .replace(/\b1\s*\/\s*2\s*(kg|l)\b/gi, "0.5 $1")
    .replace(/(\d+)\s*(?:unidades?|uni|un|u|saquitos?|saq|s)\b/gi, "$1 unidades")
    .replace(/(\d+(?:\.\d+)?)\s*(kg|kilos?|grm|grs?|gramos?|g|litros?|lts?|lt|l|ml|cc)\b/gi, (_match, amount: string, rawUnit: string) => {
      const unit = rawUnit.toLowerCase();
      const mass = /^(kg|kilo|g)/.test(unit);
      const multiplier = /^(kg|kilo|l)/.test(unit) ? 1000 : 1;
      return `${Number(amount) * multiplier} ${mass ? "g" : "ml"}`;
    }));
}

const ignored = new Set(["buscame", "busca", "buscar", "quiero", "necesito", "dame", "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "con", "por", "favor", "me", "en"]);
export function queryFitsCatalogProduct(query: string, values: string[]) {
  const words = new Set(values.flatMap((value) => normalizeCatalogText(value).split(" ")));
  return normalizeCatalogText(query).split(" ").filter((word) => !ignored.has(word)).every((word) => words.has(word));
}
