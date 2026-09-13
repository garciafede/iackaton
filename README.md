# IACKATÓN: búsqueda de productos por WhatsApp

PoC con Node.js/TypeScript, Fastify, Prisma/PostgreSQL (Neon), OpenAI Responses
y WhatsApp Cloud API. Combina 60 grupos validados con búsqueda dinámica opcional
en Carrefour, Vea y ChangoMás, caché en Neon y SEPA como fallback.

```text
WhatsApp → OpenAI / function calling → findProductOffers
                                         ↓
                              ProductSearchOrchestrator
                              ├─ flag OFF → PostgreSQL / SEPA estable
                              └─ flag ON
                                 ├─ caché Neon (TTL 30 min)
                                 ├─ Carrefour HTTP ┐
                                 ├─ Vea HTTP       ├─ en paralelo al vencer caché
                                 ├─ ChangoMás HTTP ┘
                                 └─ SEPA: fallback y contraste localizado
                                         ↓
                         EAN / presentación / sucursal / confianza
                                         ↓
                         Respuesta determinística → WhatsApp

Actualización previa: SEPA + proveedores Playwright existentes → PostgreSQL
```

El webhook recibe texto y ubicación. OpenAI elige `findProductOffers`; la herramienta
consulta el orquestador y calcula distancias. **Una consulta WhatsApp nunca abre un
navegador.** Si falla un ecommerce, sus errores no interrumpen el webhook ni borran SEPA.
La respuesta comercial se forma en código con los resultados de la herramienta;
no se utiliza texto libre del modelo para precios, tiendas, stock, distancias o fechas.

[HITO 2: configuración, semántica y verificación interna](docs/LIVE-SEARCH.md).
La integración está implementada bajo `LIVE_RETAILER_SEARCH`; el valor predeterminado
es `false`. Con `true`, encuentra productos fuera del catálogo validado. Un precio
online no prueba stock físico: sin retiro exacto se muestra la sucursal real más
cercana de la misma cadena como candidata, con precio y disponibilidad local no
confirmados. Sin sucursal dentro del radio, no se asigna una tienda lejana.

```powershell
# Una búsqueda × tres cadenas, sin escrituras de DB por defecto
npm run live:smoke
```


<!-- PRODUCT-CATALOG:START -->
## Catálogo validado de la PoC

**60 grupos comerciales consultables · 18 categorías · 62 EAN con ofertas reales.**
Última actualización SEPA: **12/09/2026, 08:30 (UTC−03:00)**.
Categorías: Aceite, Aguas, Arroz, Azúcar, Café, Conservas, Fideos, Galletitas, Gaseosas, Harina, Higiene personal, Jugos, Lácteos, Limpieza, Salsas, Snacks, Té, Yerba.

Lista generada desde el catálogo central y PostgreSQL mediante **npm run catalog:generate**.
Estos grupos constituyen el dataset validado para demo y regresiones, no el universo
máximo de productos. Con LIVE_RETAILER_SEARCH=true, findProductOffers incorpora
búsqueda dinámica HTTP en Carrefour, Vea y ChangoMás, caché Neon y fallback SEPA.
El valor predeterminado false conserva la consulta estable de PostgreSQL.
[Catálogo completo: aliases, ofertas y cobertura por cadena](docs/PRODUCT-CATALOG.md).
Las presentaciones se mantienen separadas; una marca sola puede ser ambigua.

| Producto | Marca | Presentación | Categoría | Ejemplo de búsqueda |
|---|---|---|---|---|
| Coca-Cola Sin Azúcar | Coca-Cola | 1,5 L | Gaseosas | "coca zero" |
| Galletitas Oreo Original | Oreo | 118 g | Galletitas | "oreo" |
| Yerba Mate Playadito Suave | Playadito | 1 kg | Yerba | "playadito" |
| Pepsi Black | Pepsi | 1,5 L | Gaseosas | "pepsi black" |
| Arroz Gallo Oro | Gallo | 1 kg | Arroz | "gallo oro" |
| Gaseosa Fanta Naranja | Fanta | 2,25 L | Gaseosas | "fanta naranja" |
| Pepsi Original | Pepsi | 2 L | Gaseosas | "pepsi original" |
| Sprite Lima Limón | Sprite | 2,25 L | Gaseosas | "sprite" |
| Coca-Cola Original | Coca-Cola | 354 ml | Gaseosas | "coca original lata" |
| Agua Eco de los Andes Sin Gas | Eco de los Andes | 2 L | Aguas | "eco de los andes" |
| Agua Villa del Sur Sin Gas | Villa del Sur | 2,25 L | Aguas | "villa del sur" |
| Agua Villavicencio Sin Gas | Villavicencio | 1,5 L | Aguas | "villavicencio 1.5 litros" |
| Agua Villavicencio Sin Gas | Villavicencio | 2 L | Aguas | "villavicencio 2 litros" |
| Jugo en Polvo Tang Naranja | Tang | 15 g | Jugos | "tang naranja" |
| Jugo en Polvo Tang Manzana | Tang | 15 g | Jugos | "tang manzana" |
| Jugo en Polvo Clight Pomelo Rosado | Clight | 8 g | Jugos | "clight pomelo" |
| Yerba Mate Taragüi Con Palo | Taragüi | 1 kg | Yerba | "yerba taragui" |
| Yerba Mate Cruz de Malta Con Palo | Cruz de Malta | 1 kg | Yerba | "cruz de malta" |
| Yerba Mate Unión Suave | Unión | 500 g | Yerba | "yerba union suave" |
| Café Súper Cabrales Tostado Molido | Cabrales | 250 g | Café | "cafe cabrales" |
| Café Instantáneo Dolca Orígenes | Dolca | 170 g | Café | "dolca origenes" |
| Café Instantáneo Nescafé Descafeinado | Nescafé | 100 g | Café | "nescafe descafeinado" |
| Té La Virginia | La Virginia | 25 saquitos | Té | "te la virginia" |
| Té Taragüi Diamantado | Taragüi | 25 saquitos | Té | "te taragui" |
| Galletitas Chocolinas Chocolate | Chocolinas | 170 g | Galletitas | "chocolinas" |
| Galletitas Sonrisas Frambuesa | Sonrisas | 108 g | Galletitas | "sonrisas" |
| Galletitas Lincoln Vainilla Clásicas | Lincoln | 219 g | Galletitas | "lincoln" |
| Papas Fritas Lay’s Clásicas | Lay’s | 85 g | Snacks | "lays clasicas" |
| Nachos Doritos Queso | Doritos | 77 g | Snacks | "doritos queso" |
| Palitos de Maíz Cheetos Queso | Cheetos | 85 g | Snacks | "cheetos" |
| Arroz Gallo Largo Fino 00000 | Gallo | 500 g | Arroz | "arroz gallo largo fino" |
| Arroz Lucchetti Largo Fino 00000 | Lucchetti | 1 kg | Arroz | "arroz lucchetti" |
| Fideos Lucchetti Coditos | Lucchetti | 500 g | Fideos | "coditos lucchetti" |
| Fideos Matarazzo Tirabuzones | Matarazzo | 500 g | Fideos | "tirabuzones matarazzo" |
| Fideos Matarazzo Tallarines | Matarazzo | 500 g | Fideos | "tallarines matarazzo" |
| Harina Morixe 000 | Morixe | 1 kg | Harina | "harina morixe 000" |
| Harina Morixe 0000 | Morixe | 1 kg | Harina | "harina morixe 0000" |
| Harina Pureza Leudante | Pureza | 1 kg | Harina | "harina pureza leudante" |
| Azúcar Ledesma Molida Superior | Ledesma | 1 kg | Azúcar | "azucar ledesma superior" |
| Azúcar Ledesma Selección Rubio Mascabo | Ledesma | 800 g | Azúcar | "azucar ledesma mascabo" |
| Aceite Cocinero Girasol | Cocinero | 900 ml | Aceite | "aceite cocinero 900" |
| Aceite Cocinero Girasol | Cocinero | 1,5 L | Aceite | "aceite cocinero 1.5" |
| Aceite Cocinero Oliva Extra Virgen | Cocinero | 500 ml | Aceite | "aceite oliva cocinero" |
| Arvejas Arcor Secas Remojadas | Arcor | 300 g | Conservas | "arvejas arcor" |
| Choclo Arcor Granos Amarillos | Arcor | 300 g | Conservas | "choclo arcor" |
| Atún La Campagnola Lomitos Al Natural | La Campagnola | 170 g | Conservas | "atun campagnola natural" |
| Puré de Tomate La Campagnola | La Campagnola | 530 g | Salsas | "pure tomate campagnola" |
| Tomate Arcor Pelado Perita | Arcor | 400 g | Salsas | "tomate perita arcor" |
| Mayonesa Hellmann’s Regular | Hellmann’s | 475 g | Salsas | "mayonesa hellmanns" |
| Leche La Serenísima Entera UAT | La Serenísima | 1 L | Lácteos | "leche serenisima entera" |
| Leche La Serenísima Parcialmente Descremada UAT | La Serenísima | 1 L | Lácteos | "leche serenisima descremada" |
| Dulce de Leche La Serenísima Colonial | La Serenísima | 400 g | Lácteos | "dulce de leche serenisima colonial" |
| Queso Crema Casancrem Light | Casancrem | 290 g | Lácteos | "casancrem light" |
| Lavandina Ayudín Original | Ayudín | 1 L | Limpieza | "lavandina ayudin" |
| Jabón Líquido Ala Matic Eco Lavado | Ala | 3 L | Limpieza | "jabon ala matic" |
| Detergente Cif Bioactive Limón | Cif | 300 ml | Limpieza | "detergente cif 300" |
| Detergente Cif Bioactive Limón | Cif | 500 ml | Limpieza | "detergente cif 500" |
| Shampoo Sedal Crema Balance | Sedal | 340 ml | Higiene personal | "shampoo sedal balance" |
| Shampoo Sedal Ceramidas | Sedal | 650 ml | Higiene personal | "shampoo sedal ceramidas" |
| Jabón de Tocador Dove Blanco | Dove | 90 g | Higiene personal | "jabon dove blanco" |
<!-- PRODUCT-CATALOG:END -->

## Presentación y arranque diario

- [Arranque después de reiniciar la PC](docs/START-DEMO.md).
- [Checklist 24 horas / 2 horas / 15 minutos](docs/FINAL-CHECKLIST.md).
- [Guion del video backup, máximo 3 minutos](docs/VIDEO-SCRIPT.md).
- [Fuentes para la entrega](docs/SOURCES.md).
- [Estado verificado de la candidata y bloqueantes](docs/DEMO-STATUS.md).

`npm run demo:check` revisa Node, variables, Neon, datos, acceso OpenAI/Meta y
proveedores sin actualizar PostgreSQL, enviar mensajes ni generar respuestas pagas.
Un WARN externo no hace fallar el check. Una base vacía requiere cargar datos aunque
se informe WARN; el estado del catálogo no garantiza ofertas dentro de tu radio.
El acceso al modelo no confirma saldo; la lectura de Meta no sustituye una prueba
manual de envío. Revisar ambos antes de presentar.

## Configuración y ejecución

Completar `.env` siguiendo `.env.example`, sin subirlo al repositorio ni compartir
credenciales. En desarrollo se normaliza exclusivamente el destinatario argentino
de prueba en el envío a Meta; se conserva el remitente original del webhook.

```powershell
nvm use 24.20.0
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

# Ecommerce: tres cadenas secuenciales, cinco grupos smoke por defecto
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
- **Catálogo validado: `src/catalog/products.ts`**: identidad, EAN, aliases, categoría y enabled.
  **Cadenas, provincias y selección smoke: `src/prices/config.ts`**.
  Los EAN provienen del dataset oficial; las variantes confirmadas se conservan.
  `npm run catalog:generate` regenera las tablas desde la configuración y PostgreSQL.
- **Mapping del proveedor estable: `src/prices/store-contexts.ts`**. Sigue vacío;
  la prueba de retiro documentada aún no se integró. No asignar un precio web a una tienda
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
`src/prices/registry.ts`. Ampliar el dataset validado = editar `src/catalog/products.ts`;
provincias = `src/prices/config.ts`. La búsqueda dinámica es un hito posterior.
No se modifica el agente de WhatsApp ni `findProductOffers` por cada cadena.

## Verificación y evidencia

```powershell
npm test
npm run typecheck
npm run build
npm run demo:check
npm run prices:smoke
```

`npm test` es offline. `prices:smoke` es live: Oreo en tres cadenas, sin escrituras.
`npm run build` genera `dist`; `npm start` ejecuta el backend compilado. Se necesita
el cliente Prisma generado (`npm run db:generate`). El puerto predeterminado es
3000; `PORT` permite usar otro puerto para comprobar el build aisladamente.
Un refresh con errores termina con código 1 y deja su reporte en `.cache/prices/`;
los datos anteriores siguen disponibles. Descargas grandes y perfiles temporales
están ignorados por Git.

- [Fuentes, campos observados, precedencia y límites](docs/PRICE-SOURCES.md)
- [Desarrollo asistido por IA y Playwright CLI](docs/PLAYWRIGHT-AI.md)
- [Investigación live del 13/09, sin integración al agente](docs/LIVE-RETAILER-RESEARCH.md)
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
El cierre de demo agrega continuidad acotada para «Quiero la más barata/cercana»:
conserva producto y radio en la sesión WhatsApp, durante 30 minutos. Una consulta
con otro producto se interpreta de nuevo. No hay memoria persistente ni historial
general de conversación; tras reiniciar hay que volver a compartir ubicación.
