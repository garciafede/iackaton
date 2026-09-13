import type { CatalogProduct } from "./products.js";

export type CatalogOffer = { ean: string; storeId: number; chain: string; source: string; lastCheckedAt: Date };

export function buildCatalogReport(catalog: CatalogProduct[], offers: CatalogOffer[]) {
  const enabled = catalog.filter((p) => p.enabled);
  const eans = new Set(enabled.flatMap((p) => p.eans));
  const real = offers.filter((o) => o.source.startsWith("REAL:") && eans.has(o.ean));
  const latest = (rows: CatalogOffer[]) => rows.length ? new Date(Math.max(...rows.map((o) => o.lastCheckedAt.getTime()))).toISOString() : null;
  const products = enabled.map((product) => {
    const rows = real.filter((offer) => product.eans.includes(offer.ean));
    return { ...product, offerCount: rows.length, storeCount: new Set(rows.map((o) => o.storeId)).size,
      foundEans: [...new Set(rows.map((o) => o.ean))].sort(), chains: [...new Set(rows.map((o) => o.chain))].sort(), latest: latest(rows) };
  });
  const available = products.filter((p) => p.offerCount > 0);
  return { configured: enabled.length, available: available.length,
    configuredEans: eans.size, foundEans: new Set(real.map((o) => o.ean)).size,
    categories: [...new Set(available.map((p) => p.category))].sort((a,b) => a.localeCompare(b, "es")),
    offers: real.length, stores: new Set(real.map((o) => o.storeId)).size,
    chains: [...new Set(real.map((o) => o.chain))].sort().map((chain) => ({ name: chain, offers: real.filter((o) => o.chain === chain).length,
      stores: new Set(real.filter((o) => o.chain === chain).map((o) => o.storeId)).size, products: available.filter((p) => p.chains.includes(chain)).length })),
    latestSepa: latest(real.filter((o) => o.source === "REAL:SEPA")),
    missing: products.filter((p) => !p.offerCount).map((p) => p.key), products };
}

export type CatalogReport = ReturnType<typeof buildCatalogReport>;
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
const size = (text: string) => text.replace(/(\d)\.(\d)/g, "$1,$2");
const date = (value: string | null) => value ? new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date(value)) + " (UTC−03:00)" : "Sin fecha SEPA disponible";

export function renderCatalogDocument(report: CatalogReport) {
  const rows = report.products.filter((p) => p.offerCount).map((p) =>
    `| ${cell(p.name)} | ${cell(p.brand)} | ${size(p.size)} | ${p.category} | ${p.aliases.slice(0, 3).map(cell).join("; ")} | ${p.offerCount} | ${p.chains.join(", ")} |`);
  return `# Catálogo validado de la PoC

<!-- Generado por npm run catalog:generate. No mantener una lista manual aquí. -->

- Productos/grupos consultables: **${report.available}** de ${report.configured} habilitados.
- EAN únicos con ofertas reales utilizables: **${report.foundEans}** (${report.configuredEans} configurados).
- Categorías: **${report.categories.length}** — ${report.categories.join(", ")}.
- Ofertas reales utilizables: **${report.offers}**; sucursales: **${report.stores}**.
- Última actualización SEPA presente en esas ofertas: **${date(report.latestSepa)}**.

| Cadena | Grupos consultables | Ofertas reales | Sucursales |
|---|---:|---:|---:|
${report.chains.map((chain) => `| ${chain.name} | ${chain.products} | ${chain.offers} | ${chain.stores} |`).join("\n")}

Cobertura importada: Tucumán, Córdoba, CABA y provincia de Buenos Aires, con el
límite de sucursales definido en **src/prices/config.ts**. ChangoMás sigue configurado,
pero no aporta ofertas SEPA utilizables mientras sus fechas declaradas sean antiguas.
No se agregaron otras cadenas. Los precios web sin sucursal física verificada no se importan.

Se cuentan ofertas REAL con precio positivo, sucursal y coordenadas válidas,
stock true/null y fecha dentro del límite de siete días. No se cuentan DEMO,
ofertas agotadas, vencidas ni EAN que solo aparecen en configuración. No todos los
productos tienen cobertura en cada sucursal ni dentro del radio de cada usuario.
El radio de búsqueda predeterminado sigue siendo 25 km.

| Producto | Marca | Presentación | Categoría | Aliases principales | Ofertas reales | Cadenas |
|---|---|---|---|---|---:|---|
${rows.join("\n")}

${report.missing.length ? `Grupos habilitados sin ofertas utilizables: ${report.missing.join(", ")}.\n` : "Todos los grupos habilitados tienen al menos una oferta real utilizable.\n"}
Los tamaños distintos son grupos distintos. Los EAN de un mismo grupo conservan
su identidad; por ejemplo, Gallo Oro distingue bolsa y caja en cada oferta.
Una marca sola puede ser ambigua: especificar el producto, variante y presentación.
Ejemplos: «villavicencio 1.5 litros», «villavicencio 2 litros», «harina morixe 000».

## Actualizar y ampliar

1. Editar únicamente **src/catalog/products.ts**: identidad verificada, EAN, aliases,
   categoría y **enabled**. No reutilizar un EAN o alias exacto en grupos distintos.
2. Ejecutar **npm run prices:sepa -- --dry-run** y revisar cobertura y descartes.
3. Ejecutar **npm run prices:sepa** para importar con upsert; no borra datos existentes.
4. Ejecutar **npm run catalog:generate** para regenerar este documento y la tabla del README.

**catalog:generate** solo lee PostgreSQL; no actualiza precios. Si faltan ofertas
para un grupo habilitado, lo informa y termina con código 1. Deshabilitar un grupo
no borra sus filas de PostgreSQL ni las convierte en DEMO.

Playwright consulta los cinco grupos de **playwrightSmokeProductKeys** por defecto.
Permite **--product=clave**, **--category=Categoría** o **--all** como alternativas
explícitas; no se ejecutaron búsquedas web masivas para ampliar este catálogo.

Identidades y descartes: [evidencia SEPA](../evidence/catalog/discovery.json).
Estos grupos son el dataset validado para demo y regresiones, no un máximo de
productos soportables. La búsqueda dinámica de productos no precargados está
implementada bajo LIVE_RETAILER_SEARCH=true, con tres cadenas HTTP y fallback SEPA.
El valor predeterminado false conserva la búsqueda estable. Ver [LIVE-SEARCH](LIVE-SEARCH.md).
Fuentes y reglas: [PRICE-SOURCES](PRICE-SOURCES.md).
Los precios se consultan en la aplicación; no se publican en este documento.
`;
}

export function renderReadmeCatalog(report: CatalogReport) {
  return `## Catálogo validado de la PoC

**${report.available} grupos comerciales consultables · ${report.categories.length} categorías · ${report.foundEans} EAN con ofertas reales.**
Última actualización SEPA: **${date(report.latestSepa)}**.
Categorías: ${report.categories.join(", ")}.

Lista generada desde el catálogo central y PostgreSQL mediante **npm run catalog:generate**.
Estos grupos constituyen el dataset validado para demo y regresiones, no el universo
máximo de productos. Con LIVE_RETAILER_SEARCH=true, findProductOffers incorpora
búsqueda dinámica HTTP en Carrefour, Vea y ChangoMás, caché Neon y fallback SEPA.
El valor predeterminado false conserva la consulta estable de PostgreSQL.
[Catálogo completo: aliases, ofertas y cobertura por cadena](docs/PRODUCT-CATALOG.md).
Las presentaciones se mantienen separadas; una marca sola puede ser ambigua.

| Producto | Marca | Presentación | Categoría | Ejemplo de búsqueda |
|---|---|---|---|---|
${report.products.filter((p) => p.offerCount).map((p) => `| ${cell(p.name)} | ${cell(p.brand)} | ${size(p.size)} | ${p.category} | "${cell(p.aliases[0]!)}" |`).join("\n")}
`;
}

export function updateReadmeCatalog(readme: string, report: CatalogReport) {
  const start = "<!-- PRODUCT-CATALOG:START -->", end = "<!-- PRODUCT-CATALOG:END -->";
  const section = `${start}\n${renderReadmeCatalog(report)}${end}`;
  if (readme.includes(start) && readme.includes(end)) return readme.slice(0, readme.indexOf(start)) + section + readme.slice(readme.indexOf(end) + end.length);
  const offset = readme.indexOf("\n## ");
  return offset < 0 ? readme.trimEnd() + "\n\n" + section + "\n" : readme.slice(0, offset) + "\n\n" + section + "\n" + readme.slice(offset);
}
