# Investigación de búsqueda dinámica y puntos de venta

Este documento conserva el HITO 1. La implementación posterior está documentada
en [HITO 2: búsqueda live](LIVE-SEARCH.md), conectada bajo feature flag y probada internamente.

Fecha: **13/09/2026**. Hito de investigación terminado; **no se implementó ni conectó
la arquitectura dinámica a findProductOffers**. WhatsApp y OpenAI conservan su flujo.

La conclusión más útil es que las tres cadenas permiten recuperar un catálogo
online por HTTP anónimo. **Solo Carrefour quedó demostrado, para un SKU concreto,
con precio y disponibilidad de compra online con retiro en un punto físico.**
Esto no acredita stock en góndola ni habilita a repartir el precio entre sucursales.

## Tabla comparativa

| Campo | Carrefour | Vea | ChangoMás |
|---|---|---|---|
| Ecommerce | www.carrefour.com.ar | www.vea.com.ar | www.masonline.com.ar |
| Plataforma observada | VTEX IO; GraphQL y JSON de navegación | VTEX IO; JSON de navegación | VTEX IO; JSON de navegación y simulaciones complementarias |
| Endpoint de búsqueda | /_v/segment/graphql/v1, operationName=productSearchV3; también /{consulta}?__pickRuntime=… | /{consulta}?__pickRuntime=… | /{consulta}?__pickRuntime=… |
| Método | GET | GET | GET |
| Requiere browser | No para los GET reproducidos ni la simulación probada; sí se usó para descubrirlos | No para el GET reproducido | No para el GET reproducido |
| Requiere sesión | Búsqueda y simulación probadas sin cookies/login | Búsqueda sin cookies; selección de entrega pidió login | Búsqueda sin cookies; selección de sucursal pidió login |
| Requiere ubicación | No para catálogo genérico; sí para relacionar retiro | No para catálogo genérico; contexto físico no obtenido | No para catálogo genérico; contexto físico no obtenido |
| Requiere sucursal | La simulación resolvió un pickup/seller concreto a partir de coordenadas | Selección física pendiente de autenticación | Selección física pendiente de autenticación |
| Código postal | Simulación funcionó con postalCode=null y coordenadas; pickup devolvió 4000 | No requerido por la búsqueda anónima; selección no completada | No requerido por la búsqueda anónima; selección no completada |
| EAN/GTIN | items[].ean | items[].ean en queryData decodificado | items[].ean en queryData decodificado |
| Precio | commertialOffer.Price; sellingPrice en simulación contextual | commertialOffer.Price | commertialOffer.Price |
| Stock | AvailableQuantity online; availability=available para el SKU simulado y retiro | AvailableQuantity online; stock físico no confirmado | AvailableQuantity online; stock físico no confirmado |
| Seller | 1 / CARREFOUR; sellerChain incluyó carrefourar0046 en la simulación | 1 / Jumbo Argentina, dentro del sitio Vea | 1 / MasOnline |
| Store ID | pickupPointId=carrefourar0046_0046PR; addressId=0046PR; no es un ID Prisma | storeId=null en carrito anónimo | storeId=null en carrito anónimo |
| Dirección | Catamarca 1116, San Miguel de Tucumán, en pickup simulado | No vinculada al producto | No vinculada al producto |
| Lat/lng | -26.814789, -65.20911, coordenadas públicas del pickup | No vinculadas al producto | No vinculadas al producto |
| Pickup point | Hiper Tucumán, con SLA de retiro para Magistral | No confirmado | No confirmado |
| Sales channel | No enviado explícitamente en los requests reproducidos; no se presupone su valor | salesChannel=1 en carrito anónimo, sin prueba de sucursal | salesChannel=1 en carrito anónimo, sin prueba de sucursal |
| HTTP reproducible | Sí: runtime y GraphQL HTTP 200; simulación HTTP 200 | Sí: runtime HTTP 200 | Sí: runtime HTTP 200 |

“No confirmado” significa que este hito no obtuvo esa relación; no significa que
la cadena carezca de sucursales ni que una integración autenticada sea imposible.

## Método y alcance real

Se utilizó **@playwright/cli 0.1.19 ya instalado**, Chrome y el skill local
[playwright-cli](../.claude/skills/playwright-cli/SKILL.md), con sesiones nuevas
research-carrefour, research-vea y research-changomas. No hubo reinstalaciones.
Se instrumentaron page.on("request"), page.on("response") y page.waitForResponse().
Las capturas se limitaron a XHR/fetch de los sitios; los recortes publicados no
incluyen cookies, tokens ni perfiles. Se conservan nombres de headers/cookies para
explicar el protocolo, nunca sus valores de autenticación.

Por cadena se realizaron tres búsquedas desde su interfaz:

| Consulta | Carrefour, primera página | Vea, primera página | ChangoMás, primera página |
|---|---:|---:|---:|
| detergente Magistral 500 ml | 4 | 5 | 5 |
| oreo | 14 | 16 | 18 |
| coca zero | 16 | 7 | 13 |

Son resultados devueltos, **no cantidades de coincidencias exactas**. No se paginó
ni se recorrió masivamente el catálogo. Luego se reprodujo la búsqueda de Magistral
por HTTP sin cookies: un GET en Vea, uno en ChangoMás y dos en Carrefour
(runtime y GraphQL). Los EAN, SKU y precios coincidieron con las capturas de navegador.
Se hizo además **una** simulación HTTP de ese SKU en Carrefour. No se creó pedido,
no se añadió un producto al carrito y no se escribió ningún precio live en PostgreSQL.

La navegación de disponibilidad de Carrefour pudo seleccionar provincia Tucumán,
partido Tucumán y Hiper Tucumán, Catamarca 1116. Es una referencia pública, no la
ubicación de un consumidor. Vea y ChangoMás solicitaron login al intentar configurar
entrega/sucursal: ese recorrido se detuvo y no se intentó evadirlo.

## Requests reproducibles

### JSON de navegación, observado en cada cadena

GET al origen de cada sitio, con el texto de búsqueda codificado como pathname:

```text
/{consulta}?_q={consulta}&map=ft&__pickRuntime={campos}&__device=desktop
```

El valor observado de **campos** es:

```text
appsEtag,blocks,blocksTree,components,contentMap,extensions,messages,page,pages,query,queryData,route,runtimeMeta,settings
```

No se envía body. La reproducción independiente utilizó solo el header explícito
**Accept: application/json**, además de los headers normales de Node fetch.
No necesitó Cookie, Authorization, Referer ni headers sec-ch-ua del navegador.
Las URL completas observadas están en cada fixture; no contienen credenciales.
Que haya funcionado en estas pruebas no garantiza que el sitio mantenga el contrato
ni permite ignorar un futuro 401/403/429 o un CAPTCHA.

La respuesta contiene queryData[].data como **string JSON**. Al parsearlo aparece
productSearch.products. No se debe buscar únicamente en los scripts JSON-LD del HTML:
en esta investigación el JSON de navegación sí contenía los EAN que el JSON-LD
leído por nuestros proveedores de Vea/ChangoMás no aportaba.

Diferencias reales en las variables resueltas por el sitio:

| Variable | Carrefour | Vea | ChangoMás |
|---|---|---|---|
| skusFilter | ALL_AVAILABLE | ALL | ALL |
| installmentCriteria | MAX_WITHOUT_INTEREST | MAX_WITHOUT_INTEREST | MAX_WITH_INTEREST |
| from / to inicial | 0 / 15 | 0 / 19 | 0 / 23 |
| simulationBehavior | default | default | default |
| hideUnavailableItems | true | true | true |

También aparecen query, fullText, selectedFacets, orderBy y productOriginVtex.
El sitio puede reescribir búsquedas: Oreo en Carrefour se resolvió como faceta
de marca map=b. Estas variables son parte de la respuesta del runtime, no un body
adicional obligatorio del GET de navegación.

### GraphQL de Carrefour

GET https://www.carrefour.com.ar/_v/segment/graphql/v1, sin body, con parámetros:

```text
workspace=master
maxAge=short
appsEtag=remove
domain=store
locale=es-AR
operationName=productSearchV3
variables={}
extensions={persistedQuery:{version,sha256Hash,sender,provider},variables:base64(JSON)}
```

Sender observado: vtex.store-resources@0.x; provider: vtex.search-graphql@0.x.
La huella de la consulta publicada y las variables decodificadas están en
[carrefour-http.json](../evidence/live-retailer-research/carrefour-http.json).
La huella es un identificador público de consulta, no un token. Puede cambiar con
el despliegue del retailer: no conviene tratarla como contrato permanente.

No se extrapoló ese GraphQL a Vea y ChangoMás: sus búsquedas se verificaron mediante
el JSON de navegación realmente observado. ChangoMás lanzó además operaciones
itemsWithSimulation; Vea lanzó requests de promociones. No se convirtieron esas
operaciones auxiliares en un supuesto contrato de búsqueda común.

## Qué campos realmente encontramos

| Dato | Ruta observada y criterio |
|---|---|
| Producto | productSearch.products[].productId, productName, brand |
| SKU | products[].items[].itemId; identificador local del retailer, no EAN |
| EAN/GTIN | items[].ean; no se infiere desde sku/mpn |
| Presentación | productName; properties como Contenido Neto/Capacidad cuando existen. measurementUnit=un y unitMultiplier=1 no significan 1 ml |
| Precio/lista | items[].sellers[].commertialOffer.Price / ListPrice |
| Promoción | discountHighlights y teasers cuando existen; no aplicar descuentos condicionados por tarjeta/cantidad sin verificar condiciones |
| Disponibilidad | AvailableQuantity en catálogo; availability y SLA en la simulación Carrefour |
| Vendedor | sellers[].sellerId, sellerName, sellerDefault; seller=1 no identifica una sucursal |
| Sucursal/retiro | No apareció vinculada al precio en la búsqueda genérica; Carrefour la obtuvo en pickupPoints y logisticsInfo de la simulación |
| Fecha | Se registra el momento de observación. priceValidUntil no es lastCheckedAt ni prueba de frescura |

AvailableQuantity=10000 se repitió en numerosos resultados. Se conserva como dato
crudo de disponibilidad online; **no se afirma que haya 10.000 unidades físicas**.
Los importadores actuales no se modificaron para consumir estos nuevos payloads.

## Resultado por retailer

### Carrefour: precio contextual y retiro demostrados para un SKU

La consulta pública de horarios de retiro llamó a GET /api/checkout/pub/pickup-points
con geoCoordinates (longitud;latitud), page=1 y pageSize=99. También llamó a
POST /api/checkout/pub/orderForms/simulation con un SKU auxiliar para consultar
horarios. Ese SKU auxiliar **no** se utilizó como evidencia de existencia de Magistral.

Se reprodujo el POST público documentado por VTEX, sustituyendo únicamente ese SKU
por el SKU Magistral obtenido del catálogo, con las coordenadas públicas del pickup:

```json
{
  "items": [{"id": "195332", "quantity": 1, "seller": "1"}],
  "geoCoordinates": [-65.20911, -26.814789],
  "country": "ARG",
  "postalCode": null
}
```

Headers explícitos: Content-Type: application/json y Accept: application/json.
Sin cookies ni credenciales. La respuesta HTTP 200 relacionó:

- EAN del catálogo **7790990003039**, Magistral Ultra Limón 500 ml → SKU **195332**.
- items[0].sellerChain → 1, **carrefourar0046**; availability=available.
- logisticsInfo, itemIndex=0 → SLA Retiro en Tienda/Drive, deliveryChannel=pickup-in-point.
- pickupPointId → **carrefourar0046_0046PR** → Hiper Tucumán, Catamarca 1116.
- sellingPrice=278850 centavos → **$2.788,50**; precio de lista=429000 → **$4.290**.

El listado genérico capturado había mostrado $2.960. **No deben intercambiarse
esos precios ni asociarse a cualquier tienda Carrefour.** Son observaciones del
13/09, no una promesa de vigencia. La simulación informó un plazo de 1 día hábil
y no seleccionó/reservó una franja. Retiro de compra online no equivale a existencia
en góndola para una visita inmediata.

Esta estructura es coherente con la [guía oficial VTEX de sellers y pickup](https://developers.vtex.com/docs/guides/setting-up-white-label-seller-as-pickup-point)
y la [API de Checkout](https://developers.vtex.com/docs/api-reference/checkout-api).

**Mapping posible:** relacionar SKU → ítem simulado → sellerChain → SLA del mismo
itemIndex → pickupPointId → dirección/coordenadas. Luego contrastar ese punto con
SEPA. En PostgreSQL ya existe Carrefour Tucumán III, Av. Catamarca 1116, con
coordenadas cercanas pero no idénticas. No se reemplazaron esas coordenadas ni se
creó una asociación permanente: se requiere una regla de reconciliación explícita.

**Browser:** descubrimiento y selección pública de retiro; podría servir para
redescubrir contratos. **HTTP:** búsqueda y simulación resultaron suficientes en
este caso. **Riesgos:** cambios de GraphQL, promociones, precios en centavos frente
a pesos, retiro frente a stock físico y mapping no generalizado a todos los SKU.

### Vea: catálogo identificable, punto físico pendiente

El GET de navegación devolvió EAN, producto, SKU y precio sin sesión. Por ejemplo,
Magistral Ultra Limón 500 ml comparte EAN 7790990003039 y usa SKU **232084**.
El sellerName fue **Jumbo Argentina** aunque el origen consultado era **Vea**;
ese nombre técnico no habilita a cambiar de cadena ni a elegir una sucursal Jumbo.

**Mapping:** no resuelto. El selector de entrega abrió “Ingresá a tu cuenta”. El
carrito anónimo mostró salesChannel=1, storeId=null y checkedInPickupPointId=null.
Se detuvo la selección sin iniciar sesión. El precio genérico queda con
onlinePriceFound=true y physicalStoreMapping=false.

**Browser:** descubrimiento; una futura investigación de contexto autenticado
requeriría acceso autorizado. **HTTP:** catálogo anónimo reproducido. **Riesgos:**
contexto comercial no localizado, promociones complementarias, seller genérico,
relevancia imperfecta y cambios en el JSON de navegación. Mantener SEPA como fuente
de ofertas localizadas mientras no se demuestre el vínculo SKU/precio/sucursal.

### ChangoMás: catálogo identificable, punto físico pendiente

El GET de navegación devolvió EAN y precio; Magistral Ultra Limón 500 ml usa SKU
**224771** y el mismo EAN 7790990003039. Esto mejora la evidencia respecto del
JSON-LD sin EAN que consume el proveedor estable, sin modificar dicho proveedor.

**Mapping:** no resuelto. “Elegí un método de entrega” abrió el login. El carrito
anónimo mostró salesChannel=1, storeId=null y checkedInPickupPointId=null.
La operación itemsWithSimulation observada no aportó por sí sola una sucursal
verificable para nuestro producto. No se fabricó un contexto mediante cookies.

**Browser:** descubrimiento; selección autenticada pendiente. **HTTP:** catálogo
anónimo reproducido. **Riesgos:** mismos límites de contexto y stock; ChangoMás SEPA
continúa descartado por fechas declaradas antiguas. Si ChangoMás live falla, puede
usarse SEPA válido de otras cadenas, sin atribuir esos precios a ChangoMás.

## Matching: resultado de las comprobaciones

El EAN **7790990003039** apareció en las tres cadenas para Magistral Ultra Limón
500 ml; los SKU son diferentes. Magistral Ultra Marina, Limón Cremoso y Platinum
tienen otros EAN: la consulta genérica “Magistral 500 ml” necesita distinguir esas
variantes, no combinarlas como si fueran un único artículo.

Oreo original 118 g (**7622201735296**) y 354 g (**7622201735258**) quedaron separados.
Coca Zero 1,5 L (**7790895067556**) apareció en la página consultada de ChangoMás;
Coca Zero 2,25 L (**7790895067570**) apareció en las tres. No encontrar 1,5 L en la
primera página de Carrefour/Vea no prueba ausencia en todo su catálogo.
Carrefour incluyó Powerade y Schweppes en “coca zero”: no son sustitutos válidos.

Orden recomendado para el siguiente hito: EAN exacto, comprobando presentación;
después marca+variante+presentación; por último aliases conservadores. Ante conflicto
o ambigüedad, no fusionar. Los tests offline conservan estas distinciones.

## Estado del proyecto y siguiente decisión

Los **60 grupos, 18 categorías y 63 EAN configurados** permanecen en
[src/catalog/products.ts](../src/catalog/products.ts), como catálogo validado de
demo/regresión, no como una restricción conceptual a 60 productos.
La importación SEPA terminó: **62 EAN con 3.303 ofertas reales en 59 sucursales**;
15 ofertas DEMO conservadas. Última fecha SEPA: 12/09/2026 08:30:02 Argentina.
Los filtros de calidad descartaron las fechas antiguas de ChangoMás. El comando
terminó con código 1 por esos avisos, pero la transacción válida Carrefour/Vea se
completó; no debe interpretarse como rollback de las 2.957 ofertas nuevas/actualizadas.

Se corrigieron el generador interrumpido y el matching de aliases de té sin cantidad.
No hubo cambios de schema, dependencias, sesiones WhatsApp, OpenAI ni herramientas.
El servicio sigue leyendo PostgreSQL y acepta productos almacenados fuera del
dataset validado; **todavía no descubre productos nuevos durante una conversación**.

Antes de implementar, revisar esta evidencia y acordar cómo presentar compra
online con retiro frente a disponibilidad en tienda. Orchestrator, RetailContext,
cache/TTL, consultas concurrentes y LIVE_RETAILER_SEARCH quedan **pendientes**.
El radio actual de 25 km y la ampliación explícita se conservan. No debe emitirse
una oferta física sin su vínculo verificable ni elegir una sucursal por cercanía
para justificar un precio online.

Offer.stock no describe el canal de compra ni el plazo de retiro. No corresponde
guardar automáticamente el resultado simulado como stock físico confirmado.
Esa diferencia semántica debe resolverse antes de integrar el hallazgo al formato
de respuesta; en este hito no se modificó el modelo de datos.

Verificación final: **78 tests offline aprobados, 0 fallidos; TypeScript y build
correctos**. /health y /search respondieron HTTP 200; la consulta local de prueba
devolvió 11 ofertas reales dentro de 25 km de una sucursal pública de referencia.
No se enviaron mensajes WhatsApp ni se hicieron llamadas pagas a OpenAI.
[Resumen de verificación](../evidence/live-retailer-research/verification.json).

## Evidencia y reproducción

- [Resumen de consultas y HTTP](../evidence/live-retailer-research/summary.json).
- [Carrefour HTTP y GraphQL](../evidence/live-retailer-research/carrefour-http.json),
  [Vea HTTP](../evidence/live-retailer-research/vea-http.json),
  [ChangoMás HTTP](../evidence/live-retailer-research/changomas-http.json).
- [Fixtures recortados](../tests/fixtures/live-research): queryData[].data ya
  decodificado como data.productSearch; campos comerciales retenidos sin inventarlos.
  extractedAt es la fecha de extracción del recorte, no una fecha publicada del precio.
- [Simulación de retiro](../tests/fixtures/live-research/carrefour-pickup-simulation.json).
- [Verificación del catálogo importado](../evidence/catalog/import-verification.json).
- [Tests de fixtures](../tests/live-research.test.ts) y [catálogo](../tests/catalog.test.ts).

Los tres scripts de observación están archivados en evidence/live-retailer-research.
Ejemplo para una investigación manual futura, sin instalación:

```powershell
npx --no-install playwright-cli -s=revision-vea open https://www.vea.com.ar --browser=chrome
npx --no-install playwright-cli -s=revision-vea run-code --filename=evidence/live-retailer-research/network-init.js --raw
npx --no-install playwright-cli -s=revision-vea run-code --filename=evidence/live-retailer-research/search-magistral.js --raw
npx --no-install playwright-cli -s=revision-vea run-code --filename=evidence/live-retailer-research/export-catalog.js --raw
npx --no-install playwright-cli -s=revision-vea close
```

Esperar a que termine la hidratación antes de buscar y revisar la interfaz si aparece
un modal. Ante login, CAPTCHA o bloqueo, detener ese recorrido. Estos scripts son
evidencia de investigación, no proveedores incorporados a producción.
