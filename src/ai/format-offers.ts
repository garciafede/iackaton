import type { SearchResult, SearchSort } from "../services/product-search.service.js";

type Offers = {
  product: { name: string; size: string | null };
  radiusKm: number | null;
  results: SearchResult[];
  notices?: string[];
  multipleProducts?: boolean;
};

const number = (value: number) => value.toLocaleString("es-AR", { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
// El contenido comercial proviene exclusivamente de la herramienta, nunca de output_text.
export function formatOffers(data: Offers, sort: SearchSort): string {
  const order = { price: "precio", distance: "distancia", recommended: "recomendación" }[sort];
  const radius = data.radiusKm === null ? "Sin límite de distancia" : `Dentro de ${number(data.radiusKm)} km`;
  const heading = `*${data.product.name} ${data.product.size ?? ""}*\n${radius}. Ordenadas por ${order}.`;
  const offers = data.results.slice(0, 3).map((offer, index) => {
    if (offer.live && offer.live.priceScope !== "SEPA_BRANCH") {
      const context=offer.live;
      // Las etiquetas se derivan del método, nunca de un bool stock ni texto libre.
      const exact=context.storeMappingMethod==="EXACT_PICKUP" && context.priceScope==="BRANCH_CONFIRMED" && context.fulfillment==="PICKUP";
      const clean=(value:string)=>value.replace(/[\r\n*_`~]/g," ").trim();
      const item=clean(offer.product?.name??data.product.name);
      const identity=offer.product?.ean?` · EAN ${offer.product.ean}`:" · Identificación por marca y presentación";
      const when=Number.isFinite(offer.lastCheckedAt.getTime())?`${date.format(offer.lastCheckedAt)} (UTC−03:00)`:"fecha no disponible";
      const location=`${clean(offer.store.name)}\n${clean(offer.store.address)}\n${number(offer.distanceKm)} km en línea recta`;
      const money=offer.price.toLocaleString("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2});
      const price=exact?`*$${money}* · Precio para compra online con retiro`:`*Precio online encontrado en ${offer.store.chain}: $${money}*`;
      const availability=exact?"Retiro disponible. Disponibilidad en góndola no confirmada.":"Disponibilidad online detectada. Sucursal más cercana de la cadena.\nDisponibilidad en esta sucursal no confirmada. Precio en esta sucursal no confirmado.";
      const estimate=exact&&context.shippingEstimate?` Plazo informado: ${context.shippingEstimate.replace(/bd$/," día(s) hábil(es)").replace(/d$/," día(s)").replace(/h$/," hora(s)").replace(/m$/," minuto(s)")}.`:"";
      return `${index+1}. *${item}*${identity}\n${price}\n${exact?"Punto de retiro":"Sucursal candidata"}: ${location}\n${availability}${estimate}\nFuente: ${offer.source}. Consultado online: ${when}.`;
    }
    const source = offer.source === "DEMO" ? "Resultado DEMO"
      : offer.source === "REAL:SEPA" ? "SEPA"
      : offer.source?.startsWith("REAL:PLAYWRIGHT:") ? `Playwright / ${offer.source.slice(16)}`
      : offer.source?.startsWith("REAL:") ? offer.source.slice(5) : "fuente no identificada";
    const stock = offer.stock === null ? "disponibilidad no confirmada"
      : offer.stock ? "disponible en el relevamiento" : "sin stock en el relevamiento";
    const checked = Number.isFinite(offer.lastCheckedAt.getTime())
      ? `${date.format(offer.lastCheckedAt)} (UTC−03:00)` : "fecha no disponible";
    const variant = offer.product ? `\n${[offer.product.name,offer.product.variant,offer.product.size].filter(Boolean).join(' · ')}` : "";
    const ean = offer.product?.ean ? ` · EAN ${offer.product.ean}` : "";
    const quality = offer.quality
      ? `\n${offer.quality.freshnessLabel} Confianza ${ { HIGH: "alta", MEDIUM: "media", LOW: "baja" }[offer.quality.confidence]}.` : "";
    return `${index + 1}. *$${number(offer.price)}* — ${offer.store.name}\n${offer.store.address}${variant}${ean}\n${number(offer.distanceKm)} km en línea recta · ${stock}.\nFuente: ${source}. Precio verificado: ${checked}.${quality}`;
  });
  const comparison = data.results[0]?.recommendation?.comparisonToCheapest;
  const explanation = !data.results.some(r=>r.live?.priceScope==="ONLINE_CHAIN") && !data.multipleProducts && sort === "recommended" && comparison && comparison.priceDifference > 0 && comparison.distanceSavedKm > 0
    ? `\n\nLa primera cuesta $${number(comparison.priceDifference)} más y está ${number(comparison.distanceSavedKm)} km más cerca que la más barata.` : "";
  const caveat=data.multipleProducts?"Variantes distintas: cada producto conserva su EAN; no son presentaciones intercambiables.":"";
  const scopes=data.results.some(r=>r.live?.priceScope==="ONLINE_CHAIN")?"Los precios online de cadena se comparan como referencia; no confirman el precio del local candidato.":"";
  return [heading,caveat,scopes,...offers,...(data.notices??[])].filter(Boolean).join("\n\n") + explanation;
}
