# Fuentes de precios de la PoC

Actualización del 13/09/2026: el [catálogo validado](PRODUCT-CATALOG.md) conserva
60 grupos y tiene 3.303 ofertas reales en 59 sucursales. La nueva
[investigación HTTP](LIVE-RETAILER-RESEARCH.md) obtuvo EAN en las tres cadenas y
demostró compra online con retiro para un SKU de Carrefour. El [HITO 2](LIVE-SEARCH.md)
incorpora providers HTTP bajo feature flag; los importadores estables descritos
abajo conservan sus reglas. Las observaciones live se guardan separadas de Offer.

Actualización del 12/09/2026: se importaron 338 observaciones del ZIP del día;
quedaron 346 ofertas reales en 59 sucursales. Las observaciones web continúan sin
mapping físico y ChangoMás SEPA mantiene fechas inválidas/antiguas. Ver el
[estado actual de la candidata](DEMO-STATUS.md). Los detalles de inspección que
siguen corresponden a la fuente original observada en septiembre.

Inspección realizada el 8 de septiembre de 2026. El ZIP minorista más reciente
publicado al consultar era el del 7 de septiembre. El importador descubre la
fecha en el catálogo; no supone que el archivo del día de la semana esté actualizado.

## Fuente oficial inspeccionada

- [Entrada oficial SEPA](https://www.argentina.gob.ar/economia/industria-y-comercio/defensadelconsumidor/precios-sepa)
- [Catálogo minorista](https://datos.produccion.gob.ar/dataset/sepa-precios)
- [ZIP observado del lunes](https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/0a9069a9-06e8-4f98-874d-da5578693290/download/sepa_lunes.zip)
- [Especificación técnica enlazada por el catálogo](https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/ace44eb9-c995-463f-bf8a-6f529d196a27/download/anexo_6201340_2.pdf)

Descarga observada: 330.069.965 bytes. Un ZIP exterior contiene ZIP por comercio;
estos contienen `comercio.csv`, `sucursales.csv` y `productos.csv`. Compresión ZIP
stored/deflate; CSV UTF-8 (algunos con BOM), delimitador `|`, comillas dobles y
saltos CRLF. Hay pies de archivo fuera del CSV ("Última actualización") y filas
en blanco. Se procesan las filas con las columnas esperadas; un cambio de
cabecera detiene el proveedor, no se adivinan nombres nuevos.

Los archivos grandes quedan exclusivamente en `.cache/prices/`, ignorado por
Git. Los CSV se descomprimen y leen como streams. Los ZIP interiores temporales
se eliminan al terminar; se conserva el ZIP diario como caché para evitar volver
a descargarlo. No se incluyen millones de registros en el proyecto.

## Mapeo observado

| Archivo / campo oficial | Uso |
|---|---|
| comercio.id_comercio + id_bandera | Identidad del comercio y bandera |
| comercio.comercio_razon_social | Verificación del operador |
| comercio.comercio_bandera_nombre | Verificación de cadena |
| comercio.comercio_bandera_url | Referencia del comercio |
| comercio.comercio_ultima_actualizacion | Momento declarado de actualización; futuro/antiguo se rechaza |
| sucursales.id_comercio + id_bandera + id_sucursal | Identidad externa de sucursal |
| sucursales.sucursales_nombre | Nombre de Store (con cadena) |
| sucursales.sucursales_calle + sucursales_numero | Dirección, completada con localidad y provincia |
| sucursales.sucursales_localidad | Localidad |
| sucursales.sucursales_provincia | Código de provincia para el filtro |
| sucursales.sucursales_latitud + sucursales_longitud | Coordenadas WGS84, redondeadas a seis decimales |
| productos.id_producto | Código EAN/GTIN **solo cuando productos_ean = 1** |
| productos.productos_ean | Indicador 1/0; **no es el EAN** |
| productos.productos_descripcion | Verificación del nombre y presentación |
| productos.productos_marca | Marca declarada por la fuente |
| productos.productos_cantidad_presentacion + productos_unidad_medida_presentacion | Presentación declarada (hay inconsistencias, ver abajo) |
| productos.productos_precio_lista | Precio general sin promociones condicionadas, en pesos |
| productos.productos_precio_unitario_promo1/2 + leyendas | Inspeccionados; no se usan para fingir un precio general |
| stock | **No existe en el esquema publicado** |

En Carrefour la cantidad frecuentemente es `1 UNI`, con la presentación en la
descripción. En Vea se observaron cantidades incompatibles con la unidad
(por ejemplo 1.50 ml para una descripción explícita de 1.5 litros). Por eso se
utilizan EAN identificados, y se rechazan descripciones que contradigan el
tamaño esperado. No se equiparan packs ni tamaños diferentes.

## Identidades de producto verificadas

| Producto solicitado | EAN observados y retenidos |
|---|---|
| Coca-Cola Sin Azúcar 1,5 L | `7790895067556` |
| Oreo Original 118 g | `7622201735296`, `7622201735272` |
| Playadito Suave con palo 1 kg | `7793704000928` |
| Pepsi Black 1,5 L | `7791813828419`, `7791813421054` |
| Gallo Oro Parboil 1 kg | bolsa `7790070431417`; caja `7790070433091` |

Las variantes Playadito Suave y Gallo Oro bolsa/caja fueron confirmadas por el
usuario. Los EAN diferentes permanecen separados; no se inventa un EAN común.
Oreo/Pepsi tienen más de un código publicado para la misma descripción y tamaño.
Configuración extensible: `src/prices/config.ts`.

## Cadenas y geografía verificadas

- Carrefour: comercio `10`, banderas `1` (Hipermercado Carrefour), `2` (Market),
  `3` (Express), `4` (Maxi), operador INC S.A.
- Vea: comercio `9`, bandera `1`, operador Cencosud. Se excluyen sus banderas
  Disco y Jumbo.
- ChangoMás: comercio `11`, banderas `1` a `5`, operador Dorinka.
- Provincias: `AR-T` Tucumán, `AR-X` Córdoba, `AR-C` CABA, `AR-B` Buenos Aires.
- Límite inicial: hasta ocho sucursales por cadena/provincia, seleccionado en
  orden de identificador externo. Coordenadas ausentes/inválidas impiden mapear.

## Disponibilidad y fechas

1. **Stock desconocido:** SEPA no declara stock. El usuario autorizó `Offer.stock`
   nullable. Se importa `null` y se informa "disponibilidad no confirmada".
   Se aplicó la migración `20260908050000_allow_unknown_stock`, sin alterar
   los booleanos existentes. No se escribió disponibilidad inventada.
2. **ChangoMás:** el pie de comercio.csv indica `2026-09-07T05:19:53-03:00`, pero
   el campo oficial `comercio_ultima_actualizacion` indica 2017/2021. No se usa la
   fecha de descarga para hacer pasar estos datos por actuales. Por ahora se
   excluyen de las observaciones importables y se informa el conflicto.
3. Carrefour declara `2026-09-07T08:30:02-03:00`; Vea declara
   `2026-09-07T05:03:03-03:00`. Esas fechas se conservan, sin prometer tiempo real.

La lectura completa con control de presentaciones produjo 344 observaciones
de Carrefour y Vea para los cinco grupos. Fueron importadas y verificadas en
PostgreSQL. La segunda carga no cambió ninguna oferta: evidencia más abajo.

## Comandos

```powershell
npm run prices:sepa -- --dry-run
npm run prices:sepa -- --dry-run --product="coca zero"
npm run prices:sepa -- --dry-run --file=.cache/prices/sepa/sepa-2026-09-07.zip
npm run prices:sepa
npm run prices:scrape -- --dry-run
npm run prices:scrape:carrefour -- --dry-run --product=oreo-118
npm run prices:scrape:vea -- --dry-run --product="pepsi black"
npm run prices:scrape:changomas -- --dry-run
npm run prices:smoke
```

El reporte detallado se guarda en `.cache/prices/last-sepa-refresh.json`; la
consola muestra conteos y errores. Sin `--dry-run`, cada proveedor persiste sus
observaciones válidas y mapeadas. Los reportes ecommerce tienen nombre
`last-{carrefour|vea|changomas}-refresh.json`. Si hay errores, el comando devuelve
código 1 aunque haya importado las observaciones válidas de otra cadena; consultar
`offersUpdated`. Un error transaccional revierte ese refresh, sin borrar datos previos.

## Importación y búsqueda comprobadas

`Offer.stock` admite `null` mediante la migración `20260908050000_allow_unknown_stock`.
SEPA se importa con disponibilidad no confirmada. No se deduce stock por existir un precio.

El 8/9/2026 se importaron 344 ofertas, 59 sucursales y 7 EAN que cubren los cinco grupos.
Carrefour: 151 ofertas; Vea: 193. Una segunda carga actualizó 0 ofertas y conservó las
15 ofertas DEMO. `/search` devolvió HTTP 200 para los cinco grupos, exclusivamente
resultados `REAL:SEPA` con stock desconocido. Evidencia: `evidence/sepa/import-check.json`.
ChangoMás se excluyó por las fechas antiguas declaradas; su octavo EAN identificado
solo en esa cadena permanece configurado sin importar precios no verificables.

La búsqueda agrupa EAN equivalentes por producto, conserva identidad y empaque en cada
resultado y rechaza presentaciones contradictorias. Una consulta por EAN limita a ese EAN.
Datos reales con antigüedad de hasta 7 días tienen prioridad; DEMO solo se consulta como
fallback con `NODE_ENV=development`, en una consulta separada para no mezclarlos.

## Playwright: límites y mapping

Los tres sitios fueron explorados realmente con la CLI y su skill instalada.
Ver `docs/PLAYWRIGHT-AI.md` y `evidence/playwright/`. El runtime usa el paquete
`playwright`, nunca comandos CLI. La versión se fijó a la ya instalada con la CLI.
Utiliza Chrome local; `PRICES_BROWSER_CHANNEL=chromium` selecciona un Chromium
instalado por Playwright. No cambia fingerprint, proxies ni resuelve CAPTCHA.

Carrefour: respuesta `productSearchV3` generada por el buscador, SKU/EAN y
`commertialOffer.Price`, `ListPrice`, `AvailableQuantity`. No se toman promedios
de promociones por cantidad ni descuentos de tarjetas como precio general.
Vea y ChangoMás: JSON-LD `ItemList -> Product -> AggregateOffer.offers` publicado
en los resultados. El parser exige una oferta única en ARS; `sku` y `mpn` no son
EAN y nunca se convierten en uno. Si no hay EAN se puede reconocer el grupo por
marca, nombre/variante y tamaño explícito, pero no se persiste una identidad ambigua.

Las tres sesiones públicas exigieron login al seleccionar entrega. No se inició
sesión y no se adivinó una sucursal. Por defecto `ecommerceStoreContexts` está vacío:
los hallazgos se registran como `unmapped`, sin modificar ofertas SEPA.
`src/prices/store-contexts.ts` permite declarar un mapping únicamente después de
documentar la correspondencia física y un selector con texto exacto de la sucursal
seleccionada. CP, vendedor o canal online por sí solos no alcanzan. Cambios de texto,
ausencia o ambigüedad desactivan el mapping. No existe una automatización de login.

Cada refresh hace hasta cinco búsquedas por cadena en una sesión nueva, secuencial,
con pausas de dos segundos y timeouts de 12–30 segundos. No hay reintentos automáticos
ni paginación de catálogo. `prices:smoke` consulta solo Oreo en las tres cadenas y
es independiente de `npm test`. Ante un bloqueo se detiene esa cadena y se continúa
con la siguiente. El webhook consulta únicamente PostgreSQL.

## Precedencia y extensión

`Product` se identifica por EAN. `Store` se reutiliza por cadena/nombre/dirección
exactos; si hay ambigüedad se cancela la transacción. Los importadores comparten un
lock transaccional que evita duplicados concurrentes sin añadir claves al schema.
`Offer` usa la clave única `(productId, storeId)`: solo una fecha estrictamente
más reciente puede actualizar precio/stock/fuente. Un refresh vacío o fallido no
borra ni degrada ofertas SEPA. El mismo control se aplica al importador manual.
Fuentes: `REAL:SEPA`, `REAL:PLAYWRIGHT:CARREFOUR`, `REAL:PLAYWRIGHT:VEA`,
`REAL:PLAYWRIGHT:CHANGOMAS`; `DEMO` queda reservado a los datos ficticios.

Para agregar productos/provincias, editar `src/prices/config.ts` con identidades
verificadas. Para agregar una cadena, crear otro `PriceProvider` y registrarlo en
`src/prices/registry.ts`; si participa en el refresh conjunto, agregar su key en
`ecommerceProviders`. No se cambia el agente, el webhook ni `findProductOffers`.

Los tests normales usan fixtures reducidas y mocks sin red. Comprueban parsers,
presentación, EAN, stock desconocido, upsert, precedencia, mapping y transmisión
de fuentes/instrucciones REAL/DEMO a OpenAI. No prometen determinar lo que responderá
un modelo real: esa parte tiene evidencia de integración separada.

## Cierre del circuito WhatsApp

El 9/9/2026 el usuario confirmó tanto la recepción del envío de prueba como el
intercambio real de texto y ubicación desde WhatsApp. La respuesta incluyó tres
ofertas de Coca-Cola Sin Azúcar 1,5 L a $3.890, fuente SEPA, fecha de verificación y
"disponibilidad no confirmada", sin etiqueta DEMO. El hito 3 queda confirmado;
ver `evidence/sepa/whatsapp-user-confirmation.json`.

La prueba inicial se realizó sin radio. En Fase 2 se agregó un radio predeterminado
de 25 km, ranking recomendado y clasificación de frescura/confianza. Ver
`docs/SEARCH-QUALITY.md`. La ausencia de límite requiere un pedido explícito;
los mappings físicos de ecommerce todavía no verificados siguen deshabilitados.
