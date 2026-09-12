# IACKATÓN: búsqueda de productos por WhatsApp

PoC con Node.js/TypeScript, Fastify, Prisma/PostgreSQL (Neon), OpenAI Responses
y WhatsApp Cloud API. Las fuentes se actualizan antes de atender consultas.

```text
                      ┌─ SEPA (datos oficiales)
Fuentes de precios ───├─ Carrefour / Playwright
                      ├─ Vea / Playwright
                      └─ ChangoMás / Playwright
                                  ↓
                         PostgreSQL / Neon
                                  ↓
                         findProductOffers
                                  ↓
                               OpenAI
                                  ↓
                              WhatsApp
```

El webhook recibe texto y ubicación. OpenAI elige `findProductOffers`; la herramienta
consulta PostgreSQL y calcula distancias. **Una consulta WhatsApp nunca abre un
navegador.** Si falla un ecommerce, sus errores no interrumpen el webhook ni borran SEPA.

## Configuración y ejecución

Completar `.env` siguiendo `.env.example`, sin subirlo al repositorio ni compartir
credenciales. En desarrollo se normaliza exclusivamente el destinatario argentino
de prueba en el envío a Meta; se conserva el remitente original del webhook.

```powershell
npm ci
npm run db:generate
npx --no-install prisma migrate deploy
npm run dev
```

El servidor escucha en `localhost:3000`. Para recibir eventos reales de Meta hace
falta el endpoint HTTPS del webhook ya configurado en tu entorno de prueba.

## Actualizar datos

```powershell
# Inspección sin escribir, o importación oficial con upsert
npm run prices:sepa -- --dry-run
npm run prices:sepa

# Ecommerce: tres cadenas secuenciales, cinco productos configurados
npm run prices:scrape -- --dry-run
npm run prices:scrape
npm run prices:scrape:carrefour -- --dry-run --product=oreo-118
npm run prices:scrape:vea -- --dry-run --product="pepsi black"
npm run prices:scrape:changomas -- --dry-run

# Carga manual de datos reales (placeholders deben completarse)
npm run db:seed-real -- --check
npm run db:seed-real
```

- **Datos manuales: `prisma/real-data.ts`**. Ahí se cargan los cinco productos,
  comercios/sucursales, coordenadas, precios, stock, fuente y fecha. Instrucciones:
  [prisma/REAL-DATA.md](prisma/REAL-DATA.md).
- **Productos/EAN, cadenas y provincias de SEPA: `src/prices/config.ts`**.
  Los EAN provienen del dataset oficial; las variantes confirmadas se conservan.
- **Mapping de contexto online: `src/prices/store-contexts.ts`**. Está vacío
  hasta comprobar una sucursal concreta. No asignar un precio web a una tienda
  física a partir de CP, seller o parecido del nombre.

`stock: null` significa **disponibilidad no confirmada**. No es stock disponible
ni agotado. `source` distingue DEMO y REAL sin agregar `isDemo`. Las ofertas reales
de hasta siete días tienen prioridad; DEMO solo se usa como fallback en desarrollo.
Las consultas aplican un radio de **25 km** por defecto antes de ordenar. Se puede
pedir un radio distinto o ignorar explícitamente la distancia (`radiusKm=unlimited`
en `/search`). También existe `sort=recommended`, que combina distancia, precio,
frescura y disponibilidad. [Reglas, API y ejemplos](docs/SEARCH-QUALITY.md).

Para el mismo producto/sucursal solo se acepta una observación más reciente.
Los importadores no borran DEMO. `db:seed` es el antiguo generador DEMO; no usarlo
para actualizar precios reales.

## Playwright y extensión

La CLI ya instalada y sus skills se usaron para explorar los sitios. Los proveedores
ejecutan Playwright TypeScript determinístico. Se reutiliza Chrome local de la PoC;
en otra máquina se puede instalar Chromium de Playwright y usar
`PRICES_BROWSER_CHANNEL=chromium`. No se agregaron otros frameworks o servicios.

Agregar una cadena = implementar `PriceProvider` + registrarlo/configurarlo en
`src/prices/registry.ts`. Agregar productos/provincias = editar configuración.
No se modifica el agente de WhatsApp ni `findProductOffers` por cada cadena.

## Verificación y evidencia

```powershell
npm test
npx --no-install tsc --noEmit
npm run prices:smoke
```

`npm test` es offline. `prices:smoke` es live: Oreo en tres cadenas, sin escrituras.
Un refresh con errores termina con código 1 y deja su reporte en `.cache/prices/`;
los datos anteriores siguen disponibles. Descargas grandes y perfiles temporales
están ignorados por Git.

- [Fuentes, campos observados, precedencia y límites](docs/PRICE-SOURCES.md)
- [Desarrollo asistido por IA y Playwright CLI](docs/PLAYWRIGHT-AI.md)
- [Importación y consultas reales comprobadas](evidence/sepa/import-check.json)
- [Prueba integrada y respuesta de Meta](evidence/sepa/whatsapp-outbound.json)
- [Confirmación del circuito desde WhatsApp real](evidence/sepa/whatsapp-user-confirmation.json)

Estado del 8/9/2026: 344 ofertas SEPA de Carrefour/Vea en 59 sucursales, cinco grupos
de productos y siete EAN importados. ChangoMás SEPA fue excluido por timestamps
inconsistentes. Los precios ecommerce requieren mapping físico antes de persistir.
La respuesta final de OpenAI ya distingue REAL/DEMO. El primer intento recibió
HTTP 401/código 190; tras renovar la credencial, la prueba del 9/9 recibió HTTP 200.
Se verificaron el backend activo y el túnel HTTPS existente. El 9/9 el usuario
confirmó la recepción y completó mensaje → ubicación → respuesta desde WhatsApp:
tres opciones reales de Coca-Cola a $3.890, fuente SEPA, fecha de verificación y
disponibilidad no confirmada. **Hito 3 de la fase inicial confirmado.** Esa prueba
precede al radio de 25 km agregado en Fase 2; las opciones lejanas ahora requieren
pedir explícitamente ausencia de límite.

Fase 2, hito 1: radio, ranking recomendado, frescura y confianza implementados.
Verificación: 60 tests offline aprobados y TypeScript sin errores; consultas reales
a PostgreSQL y OpenAI documentadas en [la evidencia](evidence/phase2/hito1.json).
El siguiente punto de control es conversación multiturno y UX WhatsApp.
