import type { ProductTarget } from "./config.js";

export const normalizeProductText = (value: string) => value.normalize("NFD")
  .replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/,/g, ".");

export function presentationMatches(name: string, product: Pick<ProductTarget, "quantity" | "unit">, requireCount = true): boolean {
  const text = normalizeProductText(name).replace(/\b1\s*\/\s*2\s*(kg|kilo|l|litro)\b/g, "0.5 $1");
  if (/\b(?:pack|combo|duo)\b|\b[2-9]\s*x\s*\d/i.test(text)) return false;
  if (product.unit === "unit") {
    const counts = [...text.matchAll(/(\d+)\s*[- ]?\s*(?:unidades?|uni|un|u|saquitos?|saq|s)\b/g)];
    // Un envase puede declarar 25 saquitos y 50 g: son dimensiones diferentes.
    return (counts.length > 0 || !requireCount) && counts.every((match) => Number(match[1]) === product.quantity);
  }
  const sizes = [...text.matchAll(/(\d+(?:\.\d+)?)\s*[- ]?\s*(kg|kilos?|grm|grs?|gramos?|g|litros?|lts?|l|ml|cc)\b/g)];
  if (!sizes.length) return true; // Un EAN ya verificado sigue identificando el producto.
  return sizes.every((match) => {
    const unit = match[2]!;
    const isMass = /^(kg|kilo|g)/.test(unit);
    const quantity = Number(match[1]) * (/^(kg|kilo|l(?!m))/.test(unit) ? 1000 : 1);
    return (isMass ? "g" : "ml") === product.unit && Math.abs(quantity - product.quantity) < 0.001;
  });
}

export function matchExactEan(ean: string, name: string, products: ProductTarget[]) {
  const product = products.find((candidate) => candidate.eans.includes(ean));
  return product && presentationMatches(name, product) ? product : null;
}

// Sin EAN solo reconocer el grupo; nunca asignar uno de sus códigos al SKU.
// Exige marca, presentación explícita y todas las palabras de una variante/alias.
export function matchDescription(name: string, brand: string, products: ProductTarget[]) {
  const words = (s: string) => normalizeProductText(s).replace(/[^a-z0-9.]+/g, " ").trim();
  const text = words(name);
  if (!/\d\s*(?:kg|g|grs?|lts?|l|ml|cc|unidades?|uni|un|saquitos?|saq)\b/i.test(text)) return null;
  return products.find((p) => words(brand) === words(p.brand) && presentationMatches(name, p) &&
    [p.name, ...p.aliases.filter((a) => words(a).split(" ").length >= 2)].some((alias) =>
      words(alias).split(" ").every((word) => text.split(" ").includes(word))) &&
    // Variantes con identidad más estrecha que el alias no se dan por supuestas.
    (!/suave/i.test(p.variant) || /\bsuave\b/.test(text)) &&
    (!/original/i.test(p.variant) || /\boriginal\b/.test(text))) ?? null;
}
