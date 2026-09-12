# Codex + Playwright CLI en el IACKATÓN

El 8/9/2026 Codex utilizó realmente `@playwright/cli` y la skill existente
`.claude/skills/playwright-cli/SKILL.md`, además de su referencia `running-code.md`.
Se consultó `playwright-cli --help`. No se reinstalaron la CLI ni sus skills.
Se declaró el runtime `playwright` como dependencia directa con la versión que
ya estaba instalada transitivamente: `1.63.0-alpha-2026-08-31`.

## Exploración realizada

Se abrió una sesión nueva por cadena, en orden Carrefour → Vea → ChangoMás.
En cada una se guardó un snapshot inicial, se identificó el textbox accesible,
se buscó Coca Zero y se abrió el selector de entrega. No se inició sesión ni se
ingresaron datos personales. Los tres selectores exigieron autenticación.

Comandos realmente utilizados, abreviados para reproducirlos:

```powershell
npx --no-install playwright-cli -s=prices-carrefour open https://www.carrefour.com.ar/
npx --no-install playwright-cli -s=prices-carrefour snapshot --filename=evidence/playwright/carrefour-home.yml
# fill usa el ref de la snapshot actual; los refs cambian después de navegar.
npx --no-install playwright-cli -s=prices-carrefour fill <ref-del-textbox> "coca zero" --submit
npx --no-install playwright-cli -s=prices-carrefour requests
npx --no-install playwright-cli -s=prices-carrefour response-body <indice-productSearchV3> --filename=.cache/prices/carrefour-response.json
npx --no-install playwright-cli -s=prices-carrefour close
```

En Vea y ChangoMás se repitió abrir → snapshot → buscar → inspeccionar entrega →
cerrar. Se usó `run-code --filename=...` para leer los scripts JSON-LD publicados
y campos de tarjetas visibles, sin llamar endpoints privados. Las fixtures retienen
solo nombres, identificadores de producto, precios, disponibilidad y URLs públicas.

## Estrategias generadas

| Cadena | Hallazgo observado | Runtime |
|---|---|---|
| Carrefour | El buscador dispara `productSearchV3`; incluye EAN y precios por SKU/seller | Escuchar esa respuesta de la página, parsear `data.productSearch.products` y el seller por defecto |
| Vea | Los resultados publican `ItemList/Product/AggregateOffer` en JSON-LD; SKU/MPN no son EAN | Esperar el buscador hidratado y leer JSON-LD de los resultados |
| ChangoMás | Mismo esquema JSON-LD, entrega con login | Parser separado registrado sobre el lector común del esquema observado |

Se conservan cantidades y variantes: Coca 2,25 L no sustituye a 1,5 L, ni Oreo
de otra presentación a 118 g. Sin EAN se exige marca, variante/nombre y tamaño
explícito para reconocer un grupo; no se inventa un EAN para persistirlo.

Las tarjetas pueden mostrar precios por llevar varias unidades o con tarjeta.
El parser usa el precio general de una oferta única, no el descuento condicionado.
`priceValidUntil` tampoco es el momento de verificación: el runtime usa su fecha
de observación, y SEPA conserva la fecha oficial declarada.

## Resultado de las pruebas live acotadas

| Cadena | Prueba comprobada | Duración | Persistencia |
|---|---|---:|---|
| Carrefour | Oreo 118 g, EAN `7622201735296`, $2.469, disponibilidad online | 14 s | 0: no hay sucursal física mapeada |
| Vea | Pepsi Black 1,5 L, $3.999, disponibilidad online; EAN ausente en JSON-LD | 22 s | 0: sin mapping ni identidad EAN comprobada |
| ChangoMás | Búsqueda Pepsi Black ejecutada; cuatro candidatos descartados, sin coincidencia verificada de 1,5 L | 14 s | 0 |

La primera ejecución `prices:smoke` (Oreo × tres) encontró el producto en Carrefour
y sufrió timeouts en Vea/ChangoMás. Se hizo un reintento acotado para diagnosticar
la etapa `search-url`: el campo SSR aparecía antes de tener funcionalidad JavaScript.
Se corrigió esperando el nombre accesible del textbox hidratado, observado en las
snapshots. Se verificó la corrección con el segundo producto, Pepsi Black, sin
errores de navegación. Se conserva evidencia del fallo inicial y de la verificación
posterior; no se presenta la primera corrida como exitosa.

No se ejecutó un barrido completo de los cinco productos por cada cadena en esta
verificación. El comando conjunto está configurado para un máximo de 15 búsquedas,
sin paginación, con una sesión por cadena, pausas y timeouts. No reintenta
automáticamente. No se utilizaron proxies, evasión de CAPTCHA ni fingerprint spoofing.

## Evidencia para la presentación

- `evidence/playwright/*-home.yml`: estado inicial de cada sitio.
- `evidence/playwright/*-search.yml`: resultados observados; Carrefour conserva
  la primera búsqueda por nombre completo sin coincidencia exacta.
- `evidence/playwright/*-delivery*.yml`: contexto de entrega que exige login.
- `evidence/playwright/changomas-delivery.png`: captura de ese requisito.
- `evidence/playwright/carrefour-smoke.json`: extracción con EAN conocido.
- `evidence/playwright/vea-smoke-first.json`, `changomas-smoke-first.json`:
  timeouts iniciales, conservados para distinguir fallos de éxitos.
- `evidence/playwright/vea-runtime.json`, `changomas-runtime.json`:
  resultados después de corregir la espera del buscador.
- `tests/fixtures/prices/*.json`: muestras públicas reducidas usadas por los tests.

Los archivos de caché contienen las respuestas completas temporales. La evidencia
revisada no incluye credenciales, cookies, perfiles ni datos personales introducidos.

## Qué demuestra y qué queda pendiente

La IA inspeccionó sitios reales mediante CLI y generó automatizaciones mantenibles.
El refresh de producción es TypeScript determinístico: no usa un LLM para navegar,
no ejecuta la CLI y no espera scraping durante una consulta WhatsApp.

La extracción pública no demuestra correspondencia con una sucursal. Por eso no
se actualizaron ofertas físicas con precios online. Para habilitarlo hay que observar
y documentar una selección real, y completar `src/prices/store-contexts.ts`.

El hito 1 tiene 344 ofertas SEPA importadas, 59 sucursales y cinco grupos verificados
por `/search`. El hito 2 tiene tres proveedores/fixtures y las limitaciones de esta
tabla. El hito 3 comprobó webhooks locales firmados → OpenAI real → PostgreSQL real →
respuesta generada con fuente/fecha correctas. Meta rechazó el primer envío con
HTTP 401/código 190 (`evidence/sepa/whatsapp-meta-401.json`). Tras renovar la
credencial, una nueva prueba el 9/9 recibió HTTP 200
(`evidence/sepa/whatsapp-outbound.json`). **HTTP 200 no confirma recepción en el teléfono.**
El 9/9 el usuario confirmó que recibió el envío y completó el circuito de texto y
ubicación desde WhatsApp real. Compartió una respuesta con tres opciones reales de
Coca-Cola a $3.890, fuente SEPA, fecha de verificación y disponibilidad no confirmada.
**Hito 3 confirmado por el usuario**, con evidencia en
`evidence/sepa/whatsapp-user-confirmation.json`. No se registraron teléfono,
coordenadas ni distancias que permitan reconstruir su ubicación. Las limitaciones
de mapping ecommerce siguen vigentes. La suite offline final tiene 46 tests
aprobados; TypeScript también pasa.
