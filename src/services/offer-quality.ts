// Reglas compartidas por búsqueda, API, herramienta y documentación del hito 1.
export const offerQualityConfig = {
  defaultRadiusKm: 25,
  maxRadiusKm: 20000,
  freshHours: 12,
  staleHours: 48,
  distanceScaleKm: 25,
  weights: { distance: 45, price: 35, freshness: 15, availability: 5 },
  freshnessScores: { FRESH: 1, STALE: 0.5, VERY_STALE: 0 },
} as const;

export type Freshness = "FRESH" | "STALE" | "VERY_STALE";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type OfferQuality = {
  freshness: Freshness;
  ageHours: number | null;
  freshnessLabel: string;
  confidence: Confidence;
  confidenceReasons: string[];
  storeIdentified: boolean;
};

export function resolveRadiusKm(radius: unknown = offerQualityConfig.defaultRadiusKm): number | null {
  if (radius === null) return null;
  if (typeof radius !== "number" || !Number.isFinite(radius) || radius <= 0 || radius > offerQualityConfig.maxRadiusKm) {
    throw new Error(`radiusKm debe ser mayor que 0 y hasta ${offerQualityConfig.maxRadiusKm}, o null para no limitar distancia.`);
  }
  return radius;
}

export function filterByRadius<T extends { distanceKm: number }>(offers: T[], radiusKm: number | null = offerQualityConfig.defaultRadiusKm): T[] {
  const radius = resolveRadiusKm(radiusKm);
  return offers.filter((offer) => Number.isFinite(offer.distanceKm) && offer.distanceKm >= 0 && (radius === null || offer.distanceKm <= radius));
}

export function classifyFreshness(lastCheckedAt: Date, now: Date): Pick<OfferQuality, "freshness" | "ageHours" | "freshnessLabel"> {
  const hours = (now.getTime() - lastCheckedAt.getTime()) / 3600000;
  if (!Number.isFinite(hours) || hours < 0) return {
    freshness: "VERY_STALE", ageHours: null,
    freshnessLabel: "Fecha de verificación inválida; conviene confirmar el precio.",
  };
  const freshness: Freshness = hours < offerQualityConfig.freshHours ? "FRESH" : hours <= offerQualityConfig.staleHours ? "STALE" : "VERY_STALE";
  const minutes = Math.floor(hours * 60);
  const elapsed = minutes < 1 ? "menos de un minuto" : hours < 1
    ? `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`
    : `${Math.floor(hours)} ${Math.floor(hours) === 1 ? "hora" : "horas"}`;
  return {
    freshness, ageHours: Math.floor(hours * 100) / 100,
    freshnessLabel: `Precio verificado hace ${elapsed}.${freshness === "VERY_STALE" ? " Conviene confirmar el precio por su antigüedad." : ""}`,
  };
}

export function assessOfferQuality(input: { source: string | null; stock: boolean | null; lastCheckedAt: Date; storeIdentified: boolean }, now: Date): OfferQuality {
  const freshness = classifyFreshness(input.lastCheckedAt, now);
  const official = input.source === "REAL:SEPA";
  const browser = input.source?.startsWith("REAL:PLAYWRIGHT:") === true;
  const knownSource = official || browser;
  const confidenceReasons = [
    official ? "Fuente oficial SEPA" : browser ? "Observación de ecommerce mediante Playwright" : "Fuente sin nivel de confianza validado",
    input.storeIdentified ? "Sucursal identificada en los datos" : "Sucursal no identificada",
    freshness.freshnessLabel,
    input.stock === true ? "Disponibilidad confirmada en el relevamiento" : input.stock === false ? "Sin stock en el relevamiento" : "Disponibilidad no confirmada",
  ];
  const confidence: Confidence = !knownSource || !input.storeIdentified || freshness.freshness === "VERY_STALE" || input.stock === false
    ? "LOW" : freshness.freshness === "FRESH" && input.stock === true ? "HIGH" : "MEDIUM";
  return { ...freshness, confidence, confidenceReasons, storeIdentified: input.storeIdentified };
}

export type Recommendation = {
  score: number;
  components: { distance: number; price: number; freshness: number; availability: number };
  comparisonToCheapest: {
    storeId: number; productId: number | null; priceDifference: number; distanceSavedKm: number;
  };
};

type RankedOffer = {
  store: { id: number }; product?: { id: number }; price: number; distanceKm: number;
  stock: boolean | null; quality: OfferQuality;
};
const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));

export function addRecommendations<T extends RankedOffer>(offers: T[]): Array<T & { recommendation: Recommendation }> {
  if (!offers.length) return [];
  if (offers.some((o) => !Number.isFinite(o.price) || o.price <= 0 || !Number.isFinite(o.distanceKm) || o.distanceKm < 0)) {
    throw new Error("El ranking requiere precios positivos y distancias válidas.");
  }
  const cheapest = [...offers].sort((a, b) => a.price - b.price || a.distanceKm - b.distanceKm || a.store.id - b.store.id || (a.product?.id ?? 0) - (b.product?.id ?? 0))[0]!;
  return offers.map((offer) => {
    const components = {
      distance: offerQualityConfig.weights.distance / (1 + offer.distanceKm / offerQualityConfig.distanceScaleKm),
      price: offerQualityConfig.weights.price * cheapest.price / offer.price,
      freshness: offerQualityConfig.weights.freshness * offerQualityConfig.freshnessScores[offer.quality.freshness],
      availability: offerQualityConfig.weights.availability * (offer.stock === true ? 1 : 0),
    };
    return { ...offer, recommendation: {
      score: round(Object.values(components).reduce((sum, value) => sum + value, 0), 4),
      components: { distance: round(components.distance, 4), price: round(components.price, 4), freshness: components.freshness, availability: components.availability },
      comparisonToCheapest: {
        storeId: cheapest.store.id, productId: cheapest.product?.id ?? null,
        priceDifference: round(offer.price - cheapest.price),
        distanceSavedKm: round(cheapest.distanceKm - offer.distanceKm),
      },
    } };
  });
}
