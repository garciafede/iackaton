import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { prisma } from "../src/lib/prisma.js";
import { catalogProducts } from "../src/catalog/products.js";
import { buildCatalogReport, renderCatalogDocument, updateReadmeCatalog } from "../src/catalog/report.js";
import { priceConfig } from "../src/prices/config.js";

export async function readCatalogReport() {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const eans = catalogProducts.filter((p) => p.enabled).flatMap((p) => p.eans);
    const now = Date.now();
    const offers = await tx.offer.findMany({
      where: { source: { startsWith: "REAL:" }, product: { ean: { in: eans } },
        price: { gt: 0 }, OR: [{ stock: true }, { stock: null }],
        lastCheckedAt: { gte: new Date(now - priceConfig.maxSourceAgeDays * 86400000), lte: new Date(now + 300000) },
        store: { name: { not: "" }, address: { not: "" }, chain: { not: "" }, latitude: { gte: -90, lte: 90 }, longitude: { gte: -180, lte: 180 } } },
      select: { storeId: true, source: true, lastCheckedAt: true, product: { select: { ean: true } }, store: { select: { chain: true } } },
    });
    return buildCatalogReport(catalogProducts, offers.map((offer) => ({ ean: offer.product.ean!, storeId: offer.storeId, source: offer.source!, chain: offer.store.chain, lastCheckedAt: offer.lastCheckedAt })));
  }, { maxWait: 10000, timeout: 20000 });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const report = await readCatalogReport();
    await mkdir("docs", { recursive: true });
    const readme = await readFile("README.md", "utf8");
    await writeFile("docs/PRODUCT-CATALOG.md", renderCatalogDocument(report));
    await writeFile("README.md", updateReadmeCatalog(readme, report));
    console.log(JSON.stringify({ configured: report.configured, available: report.available, eansConfigured: report.configuredEans, eansFound: report.foundEans,
      categories: report.categories, offers: report.offers, stores: report.stores, chains: report.chains, latestSepa: report.latestSepa, missing: report.missing }, null, 2));
    process.exitCode = report.missing.length ? 1 : 0;
  } catch { console.error("No se pudo generar el catálogo; revisar conexión y configuración sin publicar secretos."); process.exitCode = 1; }
  finally { await prisma.$disconnect(); }
}
