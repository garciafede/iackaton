import { prisma } from "../lib/prisma.js";
import { calculateDistanceKm } from "../utils/distance.js";
import { normalizeSearchText } from "../utils/normalize-text.js";
import { priceConfig, productTargets } from "../prices/config.js";
import { presentationMatches } from "../prices/matching.js";
import { addRecommendations, assessOfferQuality, filterByRadius, offerQualityConfig, resolveRadiusKm, type OfferQuality, type Recommendation } from "./offer-quality.js";

export type SearchableProduct = {
  id: number;
  ean?: string | null;
  brand: string;
  name: string;
  variant: string | null;
  size: string | null;
  aliases: Array<{ alias: string }>;
};

export type SearchSort = "distance" | "price" | "recommended";

export type SearchResult = {
  store: {
    id: number;
    chain: string;
    name: string;
    address: string;
  };
  price: number;
  distanceKm: number;
  stock: boolean | null;
  availability?: string;
  product?: { id: number; ean: string | null; variant: string | null; size: string | null };
  source: string | null;
  lastCheckedAt: Date;
  quality?: OfferQuality;
  recommendation?: Recommendation;
};

const similarityScore = (query: string, candidate: string): number => {
  if (!candidate) return 0;
  if (candidate === query) return 100;
  if (candidate.includes(query)) return 80;
  if (query.includes(candidate)) return 70;

  const queryTokens = query.split(" ");
  const candidateTokens = new Set(candidate.split(" "));
  const matchingTokens = queryTokens.filter((token) => candidateTokens.has(token)).length;

  if (matchingTokens === queryTokens.length) return 60;

  const overlap = matchingTokens / Math.max(queryTokens.length, candidateTokens.size);
  return overlap >= 0.6 ? Math.round(overlap * 50) : 0;
};

export const findBestProduct = (
  query: string,
  products: SearchableProduct[],
): SearchableProduct | null => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return null;

  let bestMatch: { product: SearchableProduct; score: number } | null = null;

  for (const product of products) {
    const groups = [
      { priority: 400, values: product.aliases.map(({ alias }) => alias) },
      { priority: 300, values: [product.name] },
      { priority: 200, values: [product.brand] },
      { priority: 100, values: product.variant ? [product.variant] : [] },
    ];

    const score = Math.max(
      0,
      ...groups.flatMap(({ priority, values }) =>
        values.map((value) => {
          const similarity = similarityScore(normalizedQuery, normalizeSearchText(value));
          return similarity > 0 ? priority + similarity : 0;
        }),
      ),
    );

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { product, score };
    }
  }

  return bestMatch?.product ?? null;
};

export const sortSearchResults = (
  results: SearchResult[],
  sort: SearchSort,
): SearchResult[] => {
  if (sort === "recommended" && results.some((result) => !result.recommendation)) throw new Error("Falta calcular el ranking recomendado.");
  return [...results].sort((left, right) => {
    const primary = sort === "recommended" ? right.recommendation!.score - left.recommendation!.score || left.price - right.price || left.distanceKm - right.distanceKm
      : sort === "price" ? left.price - right.price || left.distanceKm - right.distanceKm
      : left.distanceKm - right.distanceKm || left.price - right.price;
    return primary || left.store.id - right.store.id || (left.product?.id ?? 0) - (right.product?.id ?? 0);
  });
};

export const searchProductOffers = async (
  query: string,
  latitude: number,
  longitude: number,
  sort: SearchSort,
  radiusKm: number | null = offerQualityConfig.defaultRadiusKm,
) => {
  const radius = resolveRadiusKm(radiusKm);
  if (![latitude, longitude].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error("Coordenadas inválidas.");
  if (!["distance", "price", "recommended"].includes(sort)) throw new Error("Orden de búsqueda inválido.");
  const evaluatedAt = new Date();
  const products = await prisma.product.findMany({
    select: {
      id: true,
      ean: true,
      brand: true,
      name: true,
      variant: true,
      size: true,
      aliases: { select: { alias: true } },
    },
  });

  // Aliases compartidos por grupo sin reasignar ProductAlias de DEMO.
  const candidates = products.map((p) => {
    const target = productTargets.find((t) => p.ean && t.eans.includes(p.ean));
    return { ...p, aliases: [...p.aliases, ...(target?.aliases.map((alias) => ({ alias })) ?? [])] };
  });
  const realCandidates = candidates.filter((p) => p.ean && productTargets.some((t) => t.eans.includes(p.ean!)));
  const exactEan = candidates.find((p) => p.ean === query.trim());
  const product = exactEan ?? findBestProduct(query, [...realCandidates, ...candidates.filter((p) => !realCandidates.includes(p))]);
  if (!product) return null;
  const group = productTargets.find((t) => product.ean && t.eans.includes(product.ean));
  if (group && !presentationMatches(query, group)) return null;
  const packageHint = /\b(caja|bolsa)\b/i.exec(query)?.[1]?.toLowerCase();
  const groupProducts = group && !exactEan
    ? candidates.filter((p) => p.ean && group.eans.includes(p.ean) && (!packageHint || p.variant?.toLowerCase().includes(packageHint)))
    : [product];
  let offers = await prisma.offer.findMany({
    where: {
      productId: { in: groupProducts.map((p) => p.id) },
      OR: [{ stock: true }, { stock: null }], source: { startsWith: "REAL:" },
      lastCheckedAt: { gte: new Date(evaluatedAt.getTime() - priceConfig.maxSourceAgeDays * 86400000), lte: new Date(evaluatedAt.getTime() + 300000) },
    },
    include: { store: true },
  });
  if (!offers.length && process.env.NODE_ENV === "development") {
    const demoProduct = findBestProduct(query, candidates.filter((p) => !realCandidates.includes(p)));
    if (demoProduct) offers = await prisma.offer.findMany({
      where: { productId: demoProduct.id, stock: true, source: "DEMO" },
      include: { store: true },
    });
  }

  const validOffers = offers.filter((offer) => {
    const price = Number(offer.price), lat = Number(offer.store.latitude), lng = Number(offer.store.longitude);
    return offer.price != null && Number.isFinite(price) && price > 0 && offer.stock !== false &&
      offer.store.latitude != null && offer.store.longitude != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  });
  const candidatesWithDistance = validOffers.map((offer) => ({
    store: {
      id: offer.store.id,
      chain: offer.store.chain,
      name: offer.store.name,
      address: offer.store.address,
    },
    price: Number(offer.price),
    distanceKm: calculateDistanceKm(
        { latitude, longitude },
        {
          latitude: Number(offer.store.latitude),
          longitude: Number(offer.store.longitude),
        },
    ),
    stock: offer.stock,
    availability: offer.stock === null ? "disponibilidad no confirmada" : offer.stock ? "disponible" : "sin stock",
    product: (() => {
      const p = candidates.find((p) => p.id === offer.productId) ?? product;
      return { id: p.id, ean: p.ean ?? null, variant: p.variant, size: p.size };
    })(),
    source: offer.source,
    lastCheckedAt: offer.lastCheckedAt,
    quality: assessOfferQuality({ source: offer.source, stock: offer.stock, lastCheckedAt: offer.lastCheckedAt,
      storeIdentified: offer.store.id > 0 && Boolean(offer.store.chain?.trim() && offer.store.name?.trim() && offer.store.address?.trim()) }, evaluatedAt),
  }));

  // Filtrar con distancia completa: redondear antes permitiría salir del radio.
  const withinRadius = filterByRadius(candidatesWithDistance, radius);
  const results = addRecommendations(withinRadius).map((result) => ({ ...result, distanceKm: Number(result.distanceKm.toFixed(2)) }));
  const outsideRadiusCount = candidatesWithDistance.length - withinRadius.length;
  const canExpandRadius = results.length === 0 && radius !== null && outsideRadiusCount > 0;

  return {
    product: {
      id: product.id,
      brand: product.brand,
      name: product.name,
      variant: product.variant,
      size: product.size,
    },
    totalResults: results.length,
    radiusKm: radius,
    evaluatedAt,
    status: results.length ? "OK" as const : canExpandRadius ? "NO_OFFERS_WITHIN_RADIUS" as const : "NO_ELIGIBLE_OFFERS" as const,
    outsideRadiusCount,
    canExpandRadius,
    suggestedRadiusKm: canExpandRadius && radius < offerQualityConfig.maxRadiusKm
      ? Math.min(offerQualityConfig.maxRadiusKm, Math.max(offerQualityConfig.defaultRadiusKm, radius * 2)) : null,
    results: sortSearchResults(results, sort),
  };
};
