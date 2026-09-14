# Railway: dejar la demo online hoy

Usar **la misma base Neon y las mismas credenciales que funcionaron en el E2E**.
No crear otra base vacía ni ejecutar seeds. No hace falta Docker ni instalar
navegadores: las consultas live de WhatsApp usan HTTP; SEPA ya está en PostgreSQL.

## 1. Subir y conectar

Subir estos cambios al repositorio GitHub, incluyendo `package-lock.json`,
`.nvmrc`, `railway.toml`, `src/` y `prisma/` con todas sus migraciones.
**Nunca subir `.env`, credenciales ni `node_modules`.**

Railway → **New Project → Deploy from GitHub repo** → seleccionar el repositorio.
Root Directory: raíz del proyecto. Antes de desplegar, completar Variables.

## 2. Variables del servicio

Copiar los valores privados desde el `.env` local a Railway, sin publicarlos:

| Variable | Valor que corresponde |
|---|---|
| `DATABASE_URL` | Conexión pooled de la base Neon existente, con SSL. |
| `DATABASE_URL_UNPOOLED` | Conexión directa a esa misma base; el schema actual la usa para migraciones. |
| `OPENAI_API_KEY` | Credencial vigente, con saldo. |
| `OPENAI_MODEL` | El mismo modelo del E2E local. |
| `WHATSAPP_ACCESS_TOKEN` | Token Meta vigente. |
| `WHATSAPP_PHONE_NUMBER_ID` | El mismo identificador utilizado en el E2E. |
| `WHATSAPP_GRAPH_API_VERSION` | La misma versión Graph del `.env` local. |
| `WHATSAPP_VERIFY_TOKEN` | Token de verificación del webhook; debe coincidir con Meta. |
| `WHATSAPP_APP_SECRET` | App Secret de esa app Meta, para validar firmas. |
| `NODE_ENV` | **`development` para esta demo con número de prueba argentino.** |
| `LIVE_RETAILER_SEARCH` | **`true`** |
| `LIVE_PRICE_TTL_MINUTES` | `30` |
| `LIVE_PROVIDER_TIMEOUT_MS` | `8000` |

**No cambiar `NODE_ENV` a `production` para este número de prueba:** el código
existente elimina el `9` de `549…` únicamente en development; ese es el formato
de destinatario registrado y validado en Meta. Cambiarlo hoy podría reintroducir
el error `131030`. Se mantiene esa lógica sin modificarla. Development también
habilita el fallback DEMO ya existente cuando no hay ofertas reales elegibles.
Para una futura migración a un número de producción habrá que validar ese flujo
antes de cambiar el entorno. Esto no impide ejecutar el JavaScript compilado.

`PORT` lo proporciona Railway automáticamente; **no copiar el PORT local**.
El servidor usa `process.env.PORT`, escucha en `0.0.0.0` y tiene fallback local 3000.
`WHATSAPP_WABA_ID` y `WHATSAPP_TEST_RECIPIENT` no son necesarios para arrancar ni
responder webhooks. No activar instalación de Playwright/Chrome para este servicio.

## 3. Build y despliegue

`railway.toml` configura automáticamente:

| Ajuste | Valor |
|---|---|
| Builder | Railpack |
| Build command | `npm run db:generate && npm run build` |
| Pre-deploy command | `npx --no-install prisma migrate deploy` |
| Start command | `npm start` |
| Healthcheck path | `/health` |
| Healthcheck timeout | `100` segundos |

Railpack instala desde `package-lock.json` y toma Node **24.20.0** de `.nvmrc`.
No configurar una versión distinta ni omitir devDependencies durante el build:
TypeScript es necesario para compilar. Prisma CLI quedó en dependencies, con la
misma versión, para que las migraciones sigan disponibles si se podan dependencias
de desarrollo. `prisma generate` se ejecuta en Railway para generar su cliente Linux;
no subir el cliente generado en Windows.

Deploy. Las migraciones se aplican antes del arranque y una falla debe detener el
despliegue. No usar `prisma migrate dev`, `db push`, reset ni seed en Railway.
Mantener **una sola réplica y Serverless/suspensión desactivados** para esta demo:
las sesiones WhatsApp viven en memoria y el procesamiento continúa después del ACK
del webhook. No desplegar mientras se está grabando la conversación.

## 4. Dominio y Meta

1. Settings → Networking → **Generate Domain**. Railway debe dirigir el tráfico
   al puerto proporcionado en `PORT`.
2. Abrir `https://TU-DOMINIO.up.railway.app/health`: debe devolver HTTP 200 y
   `{"status":"ok"}`. Comprueba el proceso, no las credenciales ni la base.
3. En la misma app Meta → WhatsApp → Configuration/Webhooks, reemplazar la Callback
   URL de ngrok por `https://TU-DOMINIO.up.railway.app/webhooks/whatsapp`.
4. Usar el mismo `WHATSAPP_VERIFY_TOKEN` y confirmar suscripción al campo `messages`.
5. Desde el celular autorizado enviar **«Buscame Magistral Ultra Limón 500 ml y
   quiero el más barato»**, compartir ubicación y esperar la respuesta. Después
   enviar **«Buscame Coca Zero y quiero la más cercana»**.
6. Confirmar recepción, ofertas/fuente/fecha y advertencias locales. Los retailers
   pueden responder distinto desde la IP de Railway: el E2E local no sustituye este
   ensayo. Revisar logs sin mostrar secretos. Repetir «Quiero la más cercana» prueba
   la reutilización de la última búsqueda; si no hay ofertas, comprobar Neon y radio.
7. Cuando funcione desde Railway, detener el backend local y ngrok. La PC ya no
   necesita quedar encendida. Un reinicio/redeploy pierde la ubicación en memoria:
   compartirla nuevamente desde WhatsApp.

Si falla el live desde Railway, poner `LIVE_RETAILER_SEARCH=false` y redeployar
para volver a la búsqueda SEPA. Si Meta devuelve `190`, renovar su token; si devuelve
`131030`, revisar destinatario permitido y `NODE_ENV` antes de cambiar código.

## Verificación y fuentes

Verificado el 13/09/2026: `npm run db:generate` y `npm run build` OK; **106/106 tests**.
`npm start` funcionó con `NODE_ENV=development`/puerto 3317 y
`NODE_ENV=production`/puerto 3318, ambos con `/health` HTTP 200 y socket en `0.0.0.0`.
La prueba production comprobó arranque y health, no el envío al número Meta de prueba.
Las variables requeridas están presentes localmente y LIVE permanece true.
Versiones del lockfile sin cambios; solo Prisma pasó de devDependencies a dependencies.
Evidencia: [verificación local](../evidence/railway/local-verification.json).
No se hizo un deploy remoto desde esta preparación; el alta del servicio, variables,
dominio y callback son manuales. El backend local quedó restaurado con LIVE=true.

- [Railway: configuración como código](https://docs.railway.com/config-as-code).
- [Railway: pre-deploy y migraciones](https://docs.railway.com/deployments/pre-deploy-command).
- [Railpack: Node, .nvmrc y dependencias](https://railpack.com/languages/node).
- [Railway: healthchecks y PORT](https://docs.railway.com/deployments/healthchecks).
- [Railway: dominio público](https://docs.railway.com/networking/public-networking).
- [Neon: conexiones pooled/directas](https://neon.com/docs/connect/connection-pooling).
