# Fuentes y documentación de la entrega

Revisión: 13 de septiembre de 2026. No se incluyen credenciales ni URLs de conexión.
La evidencia histórica conserva su fecha; no prueba que un token siga vigente.

| Fuente oficial | Uso en esta PoC |
|---|---|
| [SEPA — Argentina.gob.ar](https://www.argentina.gob.ar/economia/industria-y-comercio/defensadelconsumidor/precios-sepa) | Entrada oficial a los datos abiertos de precios. |
| [Catálogo SEPA minorista](https://datos.produccion.gob.ar/dataset/sepa-precios) | Descubrimiento del ZIP más reciente por fecha publicada. La importación actual usa los 60 grupos del dataset validado y las sucursales seleccionadas. |
| [Especificación técnica SEPA](https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/ace44eb9-c995-463f-bf8a-6f529d196a27/download/anexo_6201340_2.pdf) | Campos de comercio, sucursal y producto. `lastCheckedAt` proviene de la fecha declarada; el stock ausente se conserva como `null`. |
| [Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/) y [colección oficial Meta en Postman](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api) | Mensajes, webhooks y configuración Cloud API. El sitio de documentación devolvió 429 durante esta revisión; las comprobaciones de credencial se hacen por Graph API. |
| [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/) | SDK `openai`, interpretación del mensaje y selección de herramienta. |
| [OpenAI Function Calling](https://developers.openai.com/api/docs/guides/function-calling) | Esquema estricto de `findProductOffers`. El orquestador entrega datos de PostgreSQL y, con flag ON, ecommerce; se formatean en código. |
| [Playwright](https://playwright.dev/docs/intro) | Runtime TypeScript de los tres proveedores; navegador fuera del recorrido de una consulta WhatsApp. |
| [Playwright CLI — Microsoft](https://github.com/microsoft/playwright-cli) | CLI usada para inspeccionar navegación y selectores durante el desarrollo. Es distinta del runtime que ejecuta los proveedores. |
| [VTEX: sellers y puntos de retiro](https://developers.vtex.com/docs/guides/setting-up-white-label-seller-as-pickup-point) y [Checkout API](https://developers.vtex.com/docs/api-reference/checkout-api) | Vínculo SKU, sellerChain, SLA y pickupPointId. El HITO 2 usa simulación pública Carrefour bajo feature flag; confirma retiro, no stock en góndola. |
| [Neon PostgreSQL](https://neon.com/docs/introduction) y [conexiones](https://neon.com/docs/connect/query-with-psql-editor) | PostgreSQL administrado; persistencia consultada mediante Prisma. |
| [Prisma ORM](https://www.prisma.io/docs/orm) | Modelos, migraciones y upsert por producto/sucursal. |
| [Prisma 6: database upserts](https://docs.prisma.io/docs/orm/v6/reference/prisma-client-reference#database-upserts) | Upsert por EAN con update no vacío y PostgreSQL ON CONFLICT para evitar carreras entre cadenas. SQL comprobado en una transacción revertida. |
| [Fastify](https://fastify.dev/docs/latest/) | Servidor HTTP y rutas `/health`, `/search`, `/chat`, `/webhooks/whatsapp`. |
| [Node.js](https://nodejs.org/docs/latest-v24.x/api/) y [TypeScript](https://www.typescriptlang.org/docs/) | Runtime y compilación. La demo fija Node 24.20.0. |
| [ngrok](https://ngrok.com/docs/start) | Túnel HTTPS hacia el backend local y Callback URL de Meta. |

Sitios comerciales efectivamente consultados: [Carrefour](https://www.carrefour.com.ar),
[Vea](https://www.vea.com.ar) y [ChangoMás](https://www.masonline.com.ar).
Son fuentes online: una página pública por sí sola no demuestra qué sucursal física
vende a ese precio. Los importadores estables exigen identificación verificable.
El HITO 2 permite una sucursal candidata real sin atribuirle precio ni stock online;
sus observaciones se almacenan como histórico separado, sin sobrescribir Offer.
No se evaden CAPTCHA ni controles de acceso.

Archivos de trazabilidad:

- [Campos y EAN observados, precedencia y límites](PRICE-SOURCES.md).
- [Uso de IA y Playwright CLI](PLAYWRIGHT-AI.md).
- [Radio, frescura y ranking](SEARCH-QUALITY.md).
- [Datos manuales y placeholders](../prisma/REAL-DATA.md): editar `prisma/real-data.ts`.
- Catálogo validado de 60 grupos: `src/catalog/products.ts`; provincias/cadenas y cinco grupos smoke: `src/prices/config.ts`.
- [Investigación HTTP y puntos físicos](LIVE-RETAILER-RESEARCH.md), con fixtures recortados de las tres cadenas.
- [Implementación live, inferencia controlada y caché](LIVE-SEARCH.md), con evidencia en `evidence/live-hito2/`.
- Reportes del último refresh: `.cache/prices/last-*-refresh.json` (locales, ignorados).
