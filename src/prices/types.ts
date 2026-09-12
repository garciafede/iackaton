export type RefreshOptions = {
  dryRun?: boolean;
  product?: string;
  file?: string;
};

export type VerifiedProduct = {
  key: string;
  ean: string;
  brand: string;
  name: string;
  variant: string;
  size: string;
};

export type PriceObservation = {
  product: VerifiedProduct;
  store: {
    externalKey: string;
    chain: string;
    name: string;
    address: string;
    province: string;
    locality: string;
    latitude: string;
    longitude: string;
  } | null;
  price: string;
  stock: boolean | null;
  source: string;
  lastCheckedAt: Date;
  productUrl?: string;
  observedName?: string;
  regularPrice?: string | null;
};

export type RefreshResult = {
  provider: string;
  productsSearched: string[];
  productsFound: string[];
  productsNotFound: string[];
  offersUpdated: number;
  unmapped: number;
  unmatched: number;
  errors: string[];
  durationMs: number;
  observations: PriceObservation[];
  unmappedDetails?: Array<{ productKey: string; ean: string | null; name: string; price: string | null; regularPrice: string | null; stock: boolean | null; url: string; checkedAt: string }>;
};

export interface PriceProvider {
  readonly name: string;
  refresh(options?: RefreshOptions): Promise<RefreshResult>;
}
