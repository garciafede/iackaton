# Cierre técnico — 12/09/2026

**Actualización HITO 2, 13/09:** [orquestador live](LIVE-SEARCH.md) implementado con
tres cadenas y flag OFF por defecto. Validación final: 106/106 tests, TypeScript y
build aprobados; `/health` y `/search` HTTP 200. Las credenciales Meta no se
revalidaron en este hito; el diagnóstico histórico de abajo no prueba su estado actual.

**Código listo para el ensayo manual; WhatsApp bloqueado por token vencido.**
El primer check de Meta respondió HTTP 200. El check final respondió HTTP 401,
`code=190`, `error_subcode=463`. Renovar la credencial localmente y repetir el check.
No se enviaron mensajes reales ni se hicieron inferencias pagas de OpenAI.

| Componente | Evidencia actual |
|---|---|
| Node / TypeScript | Node 24.20.0; `npm run typecheck` aprobado. |
| Backend / Fastify | `/health` local activo; build arrancado y verificado en un puerto aislado. |
| Prisma / Neon | 3 migraciones existentes aplicadas; lecturas correctas. Schema sin cambios. |
| OpenAI | Acceso al modelo HTTP 200. Function calling probado con mocks y consultas reales de solo lectura. Saldo e inferencia real pendientes de prueba manual. |
| WhatsApp | Token vencido en el check final. Firma, sesión, deduplicación, ubicación y seguimiento por producto verificados offline. Ngrok y backend activos durante la revisión. |
| SEPA | ZIP publicado el 12/09/2026: dry-run previo y 338 upserts. Se excluyeron las cinco banderas ChangoMás por fechas de 2017/2021. |
| Carrefour Playwright | 5 búsquedas; 4 grupos encontrados; 5 observaciones sin mapping físico. WARN, sin importación. |
| Vea Playwright | 5 búsquedas; 4 grupos encontrados; 5 observaciones sin EAN/mapping físico. WARN, sin importación. |
| ChangoMás Playwright | 5 búsquedas; 5 grupos encontrados; 5 observaciones sin EAN/mapping físico. WARN, sin importación. |
| Tests / build | 70 tests, 70 aprobados, 0 fallidos; TypeScript y build aprobados. |

Los dry-run web terminaron sin errores de navegación ni CAPTCHA. Como no había
observaciones importables con sucursal verificada, no se repitió scraping ni se
asignaron sus precios a tiendas SEPA. Los proveedores siguen fuera del webhook.

## Datos en PostgreSQL

- **12 productos totales: 7 EAN reales para los 5 grupos configurados y 5 DEMO.**
- **346 ofertas reales**, 59 sucursales; todas con fuente `REAL:SEPA`.
- 338 ofertas observadas en el archivo del 12/09; 8 ofertas conservan su fecha
  anterior. Se respetan el límite de siete días y las advertencias de antigüedad.
- 15 ofertas DEMO conservadas. Los resultados reales no se mezclan con DEMO.
- Fecha más reciente: **12/09/2026 08:30:02, UTC−03:00**.

| Cadena | Ofertas reales guardadas | Sucursales | Observaciones del 12/09 | Fecha más reciente, Argentina |
|---|---:|---:|---:|---|
| Carrefour | 151 | 28 | 149 | 12/09/2026 08:30:02 |
| Vea | 195 | 31 | 189 | 12/09/2026 05:02:55 |

`/search` del build devolvió HTTP 200 y 11 ofertas reales dentro de 25 km desde
la sucursal pública Carrefour Tucumán III. Se probó el agente contra Neon con
OpenAI simulado para Coca Zero, Oreo y producto inexistente. No se usó ubicación
personal ni se sustituyó el relevamiento por la fecha de ejecución.

## Correcciones acotadas

- `demo:check` de solo lectura, con transacción PostgreSQL `READ ONLY` y salida
  distinta para WARN y ERROR. No consulta saldo ni prueba un envío real.
- Build reproducible con el lockfile existente, `.nvmrc`, `typecheck`, `build` y `start`.
- Los hechos comerciales se formatean directamente desde `findProductOffers`;
  el texto libre del modelo no se muestra, incluso si devuelve precios inventados.
- «Más barata» y «más cercana» reutilizan producto/radio de la sesión. Saludar
  no sobrescribe el pedido pendiente. Coordenadas inválidas no se guardan.
- Logs sin query string del verify token ni objetos crudos de errores SDK;
  se conservan diagnósticos seguros de Meta en su cliente.

No se agregaron dependencias, tecnologías, cadenas ni migraciones.

## Pendiente para presentar

1. Renovar token Meta en `.env`, reiniciar backend y ejecutar `npm run demo:check`.
2. Revisar saldo OpenAI; verificar Callback URL de ngrok y suscripción `messages`.
3. Hacer el recorrido manual de [START-DEMO](START-DEMO.md), en una zona cubierta.
   El radio predeterminado es 25 km. Un resultado vacío fuera de cobertura es correcto.
4. Grabar y reproducir el [video backup](VIDEO-SCRIPT.md). El guion está listo;
   el archivo de video todavía debe grabarse.

Las sesiones son locales en memoria y vencen a los 30 minutos; un reinicio las
vacía. El saldo, conectividad externa, cobertura y caducidad del token se deben
volver a comprobar antes de presentar. Las webs no reemplazan SEPA mientras no
exista un mapping físico verificado.

Evidencia sin secretos: [verificación de la candidata](../evidence/demo-rc/verification.json).
Las comprobaciones tienen fecha: no garantizan que una credencial siga vigente después.
