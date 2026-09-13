import type {SearchResult} from "../services/product-search.service.js";

export const retailers = { CARREFOUR: "Carrefour", VEA: "Vea", CHANGOMAS: "ChangoMás" } as const;
export type Retailer = keyof typeof retailers;
export type PriceScope = "BRANCH_CONFIRMED" | "ONLINE_CHAIN" | "SEPA_BRANCH";
export type Availability = "PHYSICAL_CONFIRMED" | "PICKUP_AVAILABLE" | "ONLINE_AVAILABLE" | "ASSUMED_NEAREST_BRANCH" | "UNCONFIRMED";
export type Fulfillment = "IN_STORE" | "PICKUP" | "DELIVERY" | "UNKNOWN";
export type LiveMetadata = {
  retailer: Retailer; priceScope: PriceScope;
  storeMappingMethod: "EXACT_PICKUP" | "NEAREST_BRANCH_ASSUMPTION" | "SEPA_REPORTED";
  availability: Availability;
  availabilityConfidence: "CONFIRMED_FOR_PICKUP" | "UNCONFIRMED_AT_STORE";
  fulfillment: Fulfillment; onlineAvailable: boolean;
  sku?: string; pickupPointId?: string; sellerId?: string; salesChannel?: string;
  shippingEstimate?: string; productUrl?: string;
};
export type Branch = {id: number; chain: string; name: string; address: string; latitude: number; longitude: number; source: string};
export type LiveProduct = {ean: string | null; sku: string; name: string; brand: string; size: string | null; url: string};
export type Pickup = {id: string; sellerId: string; name: string; address: string; latitude: number; longitude: number; price: number; shippingEstimate: string | null};
export type Candidate = {product: LiveProduct; price: number; listPrice: number | null; onlineAvailable: boolean; sellerId: string; pickups: Pickup[]};
export type ProviderData = {version: 1; retailer: Retailer; checkedAt: string; candidates: Candidate[]; warnings: string[]};
export type LiveRequest = {query: string; latitude: number; longitude: number; radiusKm: number | null; preferredEans?: string[]};
export type LiveProvider = {retailer: Retailer; search(input: LiveRequest, signal: AbortSignal): Promise<ProviderData>};
export type ProviderReport = {retailer: Retailer; status: "OK" | "WARN"; durationMs: number; cache: "HIT" | "MISS" | "DISABLED"; candidates: number; warnings: string[]};
export type LiveResult = SearchResult & {live: LiveMetadata};
