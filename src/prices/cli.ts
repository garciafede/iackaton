import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { priceProviders, ecommerceProviders } from "./registry.js";
import type { RefreshOptions } from "./types.js";
import { persistObservations } from "./persist.js";
import { prisma } from "../lib/prisma.js";

async function main() {
  const args = process.argv.slice(2);
  const provider = args.find((arg) => !arg.startsWith("--")) ?? "sepa";
  const names = provider === "scrape" ? ecommerceProviders : [provider];
  if (names.some((name) => !priceProviders[name])) throw new Error("Proveedor desconocido.");
  const options: RefreshOptions = { dryRun: args.includes("--dry-run") };
  const product = args.find((arg) => arg.startsWith("--product="))?.slice(10);
  const file = args.find((arg) => arg.startsWith("--file="))?.slice(7);
  const category = args.find((arg) => arg.startsWith("--category="))?.slice(11);
  if (product) options.product = product;
  if (file) options.file = file;
  if (category) options.category = category;
  if (args.includes("--all")) options.all = true;
  if (args.some((arg) => arg.startsWith("--") && !/^(--dry-run|--all|--product=.+|--category=.+|--file=.+)$/.test(arg))) throw new Error("Opción desconocida o vacía.");
  // Secuencial: cinco grupos web por defecto; ampliar solo con filtro explícito.
  for (const name of names) {
  const started = Date.now();
  const result = await priceProviders[name]!().refresh(options);
  if (!options.dryRun) {
    try { result.offersUpdated = await persistObservations(prisma, result.observations); }
    catch { result.errors.push("Falló la persistencia; transacción revertida. Revisar conexión/mapping sin publicar secretos."); }
  }
  await mkdir(".cache/prices", { recursive: true });
  result.durationMs = Date.now() - started;
  const reportFile = join(".cache/prices", `last-${name}-refresh.json`);
  await writeFile(reportFile, JSON.stringify(result, null, 2));
  const chainCounts: Record<string, number> = {};
  for (const observation of result.observations) {
    const chain = observation.store?.chain ?? "Sin mapping";
    chainCounts[chain] = (chainCounts[chain] ?? 0) + 1;
  }
  console.log(JSON.stringify({ ...result, observations: result.observations.length, chainCounts, reportFile }, null, 2));
  if (result.errors.length) process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("Falló la actualización de precios; revisar configuración y reporte local.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
