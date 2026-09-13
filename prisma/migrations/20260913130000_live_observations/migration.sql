ALTER TABLE "Product" ADD COLUMN "liveOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Store" ADD COLUMN "source" TEXT;
CREATE TABLE "LiveObservation" (
  "id" SERIAL NOT NULL,
  "cacheKey" TEXT NOT NULL,
  "retailer" TEXT NOT NULL,
  "lastCheckedAt" TIMESTAMP(3) NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LiveObservation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LiveObservation_cacheKey_lastCheckedAt_idx" ON "LiveObservation"("cacheKey", "lastCheckedAt");
