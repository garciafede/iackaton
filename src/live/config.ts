const number = (value: string | undefined, fallback: number, min: number, max: number) => {
  const n = value === undefined ? fallback : Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
export const liveEnabled = () => process.env.LIVE_RETAILER_SEARCH === "true";
export const liveConfig = () => ({
  ttlMinutes: number(process.env.LIVE_PRICE_TTL_MINUTES, 30, 1, 1440),
  timeoutMs: number(process.env.LIVE_PROVIDER_TIMEOUT_MS, 8000, 100, 15000),
  maxCandidates: 3,
});
