# HITO 2 — búsqueda dinámica e inferencia controlada

Implementado y validado internamente el 13/09/2026. Los 60 grupos del catálogo
siguen siendo el dataset validado de demo/regresión; no limitan la búsqueda live.
Se mantienen los importadores SEPA/Playwright existentes, WhatsApp, sesiones y
function calling. No se agregaron dependencias ni se enviaron mensajes reales.

Resultado final: **106/106 tests**, TypeScript y build aprobados. `/health` y
`/search` devolvieron HTTP 200; la búsqueda estable de Coca Zero devolvió 11 ofertas
SEPA dentro de 25 km desde la referencia pública. Ver [resumen de evidencia](../evidence/live-hito2/README.md).

## Activar o volver a SEPA

En `.env`, sin compartir el archivo:

```dotenv
LIVE_RETAILER_SEARCH=true
LIVE_PRICE_TTL_MINUTES=30
LIVE_PROVIDER_TIMEOUT_MS=8000
```

Reiniciar `npm run dev`. Para volver al recorrido estable, cambiar el flag a `false`
y reiniciar. Ausente equivale a OFF. La instalación local queda con el default OFF
hasta la revisión del hito. No hace falta borrar datos ni revertir tablas. En OFF
no se consultan providers, caché ni sucursales adicionales.

En otra instalación, con el backend detenido:

```powershell
npx --no-install prisma migrate deploy
npm run db:generate
npm run dev
```

La migración aditiva `20260913130000_live_observations` ya se aplicó en esta base:
`Product.liveOnly`, `Store.source` y `LiveObservation`. No modifica `Offer`.

## Recorrido y límites

`findProductOffers` y `/search` → `ProductSearchOrchestrator` → tres providers HTTP
en paralelo mediante `Promise.allSettled`, caché Neon y consulta SEPA concurrente.
Cada cadena tiene un timeout de 8 s; la simulación pickup de Carrefour tiene un
límite interno de 2,5 s. Las operaciones de caché y fallback también tienen límites.
Un timeout o HTTP fallido produce WARN y conserva otras cadenas y SEPA elegible.
El recorrido completo puede sumar lectura/escritura de caché al timeout del
provider; 8 s no es un SLA global.

Se usan los endpoints públicos observados en el [HITO 1](LIVE-RETAILER-RESEARCH.md).
No se envían cookies ni credenciales del usuario. No hay bypass de CAPTCHA, login,
reintentos de 403 ni scraping masivo. Una consulta no abre Playwright.

## Qué significa cada resultado

| Origen | Mapping | Availability / confidence | Price scope / fulfillment |
|---|---|---|---|
| Carrefour: SKU, seller y pickup verificables | EXACT_PICKUP | PICKUP_AVAILABLE / CONFIRMED_FOR_PICKUP | BRANCH_CONFIRMED / PICKUP |
| Carrefour sin pickup; Vea; ChangoMás | NEAREST_BRANCH_ASSUMPTION | ASSUMED_NEAREST_BRANCH / UNCONFIRMED_AT_STORE | ONLINE_CHAIN / UNKNOWN |
| SEPA localizado | SEPA_REPORTED | UNCONFIRMED / UNCONFIRMED_AT_STORE | SEPA_BRANCH / UNKNOWN |

Los tipos internos también representan PHYSICAL_CONFIRMED, ONLINE_AVAILABLE,
IN_STORE y DELIVERY, pero estos providers **no afirman stock físico confirmado**.
La señal `onlineAvailable` nunca se copia como `Offer.stock=true`; los resultados
live mantienen `stock=null`.

Carrefour exige coincidencia SKU/seller/SLA/pickup, dirección y coordenadas válidas;
el importe de la simulación se convierte de centavos a pesos. El retiro se presenta
como compra online con retiro, con advertencia de góndola no confirmada. Si el punto
no está en Store, conserva su identificación externa y `store.id=0`; no se inventa
un ID persistido. Solo se vincula con Store si concuerdan ubicación y calle/número.

La inferencia usa sucursales reales de **la misma cadena** en Store, procedencia
REAL, dirección y coordenadas válidas; excluye DEMO. Radio predeterminado: 25 km.
Distancia: Haversine en línea recta, filtrada sin redondear. Sin sucursal dentro del
radio se informa falta de cobertura y se permite ampliarlo, sin asignar otra lejana.

Se importaron **22 sucursales ChangoMás** desde `sucursales.csv` del ZIP oficial
SEPA del 12/09, luego de dry-run. No se importaron sus precios antiguos. Hay 81
sucursales reales candidatas: 28 Carrefour, 31 Vea y 22 ChangoMás; 59 tienen ofertas
SEPA. La procedencia SEPA de una dirección no garantiza que siga operativa: la
relación sucursal/producto es inferida.

## Identidad, ranking y respuesta

EAN/GTIN válido y coincidencia exacta tienen prioridad. Marca, variante y tamaño
deben ser compatibles; no se agrupan presentaciones diferentes. Sin EAN se exige
matching conservador de marca y presentación explícita, y no se inventa EAN ni se
persiste ese producto. Conflictos de identidad entre fuentes se omiten. Las variantes
conservan sus EAN en la respuesta.

`price` y `distance` conservan su criterio principal. `recommended` incorpora
confianza: pickup exacto > SEPA localizado > inferencia. Una opción inferida más
barata participa del orden por precio, con advertencias. Un pickup más reciente
reemplaza el resultado SEPA equivalente; el precio de cadena puede convivir con
SEPA como información de distinto alcance. Si hay live válido no se agregan DEMO.
OFF conserva las reglas estables de selección REAL/DEMO.

El formateador construye precio, fuente, dirección, distancia, fecha y disponibilidad
desde la herramienta. No usa texto libre de OpenAI para completarlos. Ejemplo observado:

> Precio online encontrado en Vea: $4.990,00.
> Sucursal candidata: Vea Av Sarmiento, a 1,41 km en línea recta.
> Disponibilidad en esta sucursal no confirmada. Precio en esta sucursal no confirmado.
> Fuente: REAL:LIVE:VEA. Consultado online: 13/09/2026, 10:21 (UTC−03:00).

Las distancias se midieron desde una **referencia pública**, Carrefour Catamarca
1116, no desde la ubicación del usuario. Son observaciones históricas, no garantía
del precio o disponibilidad actuales. El ejemplo completo está en la evidencia.

## Caché y persistencia

`LiveObservation` guarda observaciones append-only por cadena, `lastCheckedAt`
original y JSON comercial validado. La clave hash incluye consulta normalizada,
cadena, ubicación, radio y EAN preferidos; excluye el orden para reutilizar al
reordenar. No guarda coordenadas personales como clave legible. TTL: 30 min por
defecto. Un HIT no llama al ecommerce ni cambia la fecha. Al vencer, se consulta
de nuevo; el histórico se conserva y no se presenta como recién verificado.
Un fallo de lectura/escritura de caché no descarta resultados live válidos.

Los descubrimientos con EAN y tamaño se guardan por upsert atómico en Product,
sin cambiar identidad ni aliases del catálogo previo. `liveOnly=true` los aísla
del modo OFF; una importación real SEPA o manual los promueve a `false` si incorpora
ese producto. Las observaciones live no sobrescriben las 3.303 ofertas reales ni
las 15 DEMO. No se agrega una política automática de borrado del histórico.

## Comandos y evidencia

```powershell
# Una consulta × tres cadenas; lee sucursales, no persiste resultados
npm run live:smoke
npm run live:smoke -- --query="detergente Magistral ultra limon 500 ml"

# Catálogo geográfico desde ZIP oficial descargado; dry-run por defecto
npm run db:sepa-stores -- --file=.cache/prices/sepa/sepa-2026-09-12.zip --chain=changomas --dry-run
# --apply inserta sucursales faltantes, sin sobrescribir existentes

npm test
npm run typecheck
npm run build
```

El smoke usa la referencia pública mencionada, salvo que se proporcionen juntos
`--lat`, `--lng` y opcionalmente `--radius`. Consulta como máximo tres candidatos
conservadores por cadena de la primera respuesta; no recorre todo el catálogo.
Los sitios pueden cambiar, bloquear requests o no devolver una coincidencia:
dinámico no significa cobertura garantizada de cualquier producto.

Evidencia del 13/09 en [live-hito2](../evidence/live-hito2/): smoke real sin escrituras,
HIT real de tres cadenas, respuesta OFF igual a SEPA, conteos preservados y prueba
de SQL nativo en transacción revertida. Los tests usan mocks/fixtures, incluyendo
timeout, caché vencida, radio y la prohibición de convertir inferencia en
PHYSICAL_CONFIRMED. No se hicieron llamadas OpenAI ni envíos WhatsApp en este hito.
