# Fase 2 · Hito 1: radio, recomendación, frescura y confianza

Implementado incrementalmente sobre la búsqueda existente. No requiere migraciones,
dependencias nuevas, cambios en providers ni escrituras en la base. El webhook sigue
consultando ofertas precargadas en PostgreSQL mediante `findProductOffers`.

## Radio y API

El radio predeterminado es **25 km**, también al ordenar por precio. `distance`
sigue siendo el orden predeterminado. La distancia se calcula con Haversine en
línea recta; no es una distancia de conducción. El filtro usa la distancia completa
antes de redondear para mostrarla e incluye el borde del radio.

```text
GET /search?q=coca%20zero&lat=...&lng=...&sort=price
GET /search?q=coca%20zero&lat=...&lng=...&sort=distance&radiusKm=5
GET /search?q=coca%20zero&lat=...&lng=...&sort=recommended&radiusKm=25
GET /search?q=coca%20zero&lat=...&lng=...&sort=price&radiusKm=unlimited
```

`radiusKm` numérico admite valores mayores que cero y hasta 20.000 km. `unlimited`
o `null` en la URL representan ausencia de límite; en la herramienta se usa JSON
`null`. Un valor omitido conserva 25 km. Inputs inválidos reciben HTTP 400.

El agente interpreta:

| Pedido | Radio | Orden |
|---|---:|---|
| “Buscame Coca Zero cerca mío” | 25 km | distance |
| “Coca Zero a menos de 5 km” | 5 km | distance, salvo otro pedido |
| “No importa la distancia, quiero el más barato” | sin límite | price |
| “Recomendame la mejor opción” | 25 km | recommended |

Las frases explícitas tienen un respaldo determinístico en
`src/ai/search-preferences.ts`. Un `null` del modelo sin pedido explícito de
ignorar distancia no elimina el radio predeterminado.

La respuesta mantiene `product`, `totalResults` y `results`, y agrega:

- `radiusKm`, `evaluatedAt`: alcance y hora de evaluación de esa búsqueda.
- `status`: `OK`, `NO_OFFERS_WITHIN_RADIUS` o `NO_ELIGIBLE_OFFERS`.
- `outsideRadiusCount`: cantidad de ofertas elegibles fuera del radio, sin publicar
  sus filas entre los resultados locales.
- `canExpandRadius`, `suggestedRadiusKm`: propuesta de ampliación cuando hay ofertas
  fuera del radio. Se propone `max(25, radio × 2)`, limitado a 20.000 km; después
  se puede ofrecer ausencia de límite. No se promete que el nuevo radio tenga ofertas.

Un producto no identificado sigue devolviendo HTTP 404. Un producto identificado
sin ofertas dentro del radio devuelve HTTP 200 y una lista vacía. El agente ofrece
ampliar mediante un mensaje basado en esos datos, sin llamar otra vez a OpenAI ni
inventar precios. Si no existen ofertas elegibles en los datos disponibles, informa
esa ausencia en vez de prometer resultados al ampliar.

Los datos reales fuera del radio no se reemplazan por DEMO cercanos. Se conserva
la precedencia REAL/DEMO previa y el fallback DEMO exclusivo de desarrollo. Precios
faltantes/no positivos y coordenadas inválidas no participan del ranking.

## Frescura

Las constantes y reglas viven en **`src/services/offer-quality.ts`**.

| Antigüedad al evaluar | Clasificación |
|---|---|
| menor que 12 horas | FRESH |
| desde 12 hasta 48 horas inclusive | STALE |
| más de 48 horas | VERY_STALE |

`quality.ageHours` y `quality.freshnessLabel` se calculan en código usando un único
`evaluatedAt` por búsqueda. Ejemplo: “Precio verificado hace 3 horas”. Los muy
antiguos incluyen una recomendación de confirmar el precio. Fechas inválidas o
futuras se tratan conservadoramente: VERY_STALE, antigüedad desconocida y confianza
baja. No se convierten en datos recientes.

Se mantiene el límite previo de elegibilidad de siete días (`priceConfig.maxSourceAgeDays`):
clasificar antigüedad no vuelve a habilitar los precios históricos de ChangoMás
excluidos. La hora de importación no sustituye `lastCheckedAt`.

## Confianza

La confianza **no es una probabilidad** ni una evaluación de OpenAI. Se basa en la
fuente, la antigüedad, los datos de sucursal y el stock del relevamiento.

| Condiciones | Confianza |
|---|---|
| Fuente SEPA/Playwright, sucursal identificada, FRESH y stock confirmado | HIGH |
| Fuente SEPA/Playwright, sucursal identificada, FRESH con stock desconocido o STALE | MEDIUM |
| Fuente sin política validada, sucursal no identificada, VERY_STALE o sin stock | LOW |

“Sucursal identificada” exige un registro con ID, cadena, nombre, dirección y
coordenadas válidas. Depende de los controles de importación/mapping existentes;
no constituye una nueva verificación independiente del comercio. DEMO y fuentes
manuales sin política validada tienen confianza baja.

`quality.confidenceReasons` explica los factores usados. `stock: null` conserva
“disponibilidad no confirmada”; ni siquiera HIGH garantiza stock en tiempo real.

## Ranking recomendado

La recomendación usa solo las ofertas elegibles **dentro del radio**. El precio
mínimo de referencia también pertenece a ese conjunto.

```text
score = 45 × 1 / (1 + distanciaKm / 25)
      + 35 × precioMínimo / precioOferta
      + 15 × frescura
      +  5 × disponibilidadConfirmada

frescura: FRESH=1, STALE=0,5, VERY_STALE=0
disponibilidadConfirmada: stock=true → 1; stock=null → 0
```

Los pesos y la escala de distancia están centralizados y son ajustables. La fórmula
es una heurística inicial explicable, sin ML; no está calibrada con preferencias de
usuarios. El score va de 0 a 100, se ordena de mayor a menor y desempata por precio,
distancia, sucursal y producto para mantener estabilidad.

Cada resultado incluye `recommendation.score`, sus componentes y
`recommendation.comparisonToCheapest`: sucursal/EAN de referencia (mediante productId),
`priceDifference` y `distanceSavedKm`. Estos últimos pueden ser negativos y se calculan
en código. El agente explica diferencias positivas con frases naturales, sin exponer
scores o pesos al consumidor. El test de $200 adicionales y 8 km ahorrados usa una
fixture **sintética**, no se presenta como un precio observado.

## Ejemplo real verificado el 9/9/2026

Se usó como punto de referencia la sucursal pública SEPA **Carrefour Tucumán III,
Av. Catamarca 1116**, no una ubicación personal. PostgreSQL y OpenAI fueron reales;
no hubo escrituras ni mensajes enviados a Meta durante este hito.

| Consulta | Ofertas | Primera opción | Precio | Distancia desde la referencia |
|---|---:|---|---:|---:|
| price, 25 km | 11 | Carrefour Tucumán III | $3.900 | 0 km |
| price, 5 km | 9 | Carrefour Tucumán III | $3.900 | 0 km |
| price, sin límite | 36 | Carrefour Córdoba Villa Allende | $3.890 | 506,93 km |
| recommended, 25 km | 11 | Carrefour Tucumán III | $3.900 | 0 km |

La fuente fue SEPA, la disponibilidad desconocida y la confianza media. Al comprobar
el ejemplo, las ofertas Carrefour tenían aproximadamente 41 horas de antigüedad
(STALE); las Vea, 44. Son observaciones de esa ejecución, no valores permanentes.

Los cuatro pedidos se comprobaron también con OpenAI real: eligió correctamente
radio y orden. Evidencia: **`evidence/phase2/hito1.json`**, con respuestas capturadas
y resultados acotados a las tres primeras opciones.

## Tests, límites y siguiente hito

`npm test`: **60 tests aprobados**, incluidos los 46 originales y 14 nuevos.
`tsc --noEmit`: sin errores. Los tests normales son offline y cubren límites de
radio, ampliación propuesta, filtro antes de ranking, frescura, confianza, precios
inválidos, desempates y transmisión de parámetros al agente.

Archivos de implementación: `src/services/offer-quality.ts`,
`src/services/product-search.service.ts`, `src/routes/search.ts`,
`src/ai/search-preferences.ts`, `src/ai/tools.ts` y `src/ai/agent.ts`.
Tests: `tests/search-quality.test.ts`, ampliaciones en `tests/chat.test.ts` y `package.json`.
Documentación/evidencia: `README.md`, `docs/PRICE-SOURCES.md`,
`docs/SEARCH-QUALITY.md` y `evidence/phase2/hito1.json`.

Cambio visible: consumidores anteriores de `/search` pasan a un radio de 25 km
por defecto; deben pedir `unlimited` para conservar el alcance nacional.
La búsqueda aún carga las ofertas elegibles del producto antes de calcular
distancias en memoria. Es adecuado para el catálogo acotado actual; no se agregó
un índice geoespacial ni se afirma haber medido escalabilidad nacional.

El radio vacío **ofrece** ampliar. Recordar automáticamente producto/radio/orden
para continuar con “ampliá”, “más barata” u “otra opción” corresponde al **hito 2**.
Recomendación: implementar esa memoria sobre la sesión y su TTL existentes, junto
con saludos/ayuda sin pedir ubicación antes de una intención de búsqueda.
Este punto de control se detiene aquí; no incluye los hitos posteriores.
