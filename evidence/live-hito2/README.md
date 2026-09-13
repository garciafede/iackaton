# Validación interna del HITO 2 — 13/09/2026

Producto fuera de los 60 grupos: **Detergente Magistral Ultra Limón 500 ml**, EAN
**7790990003039**. Referencia de distancia: sucursal pública Carrefour Catamarca
1116 en San Miguel de Tucumán; no ubicación personal.

| Cadena | Estado | Duración HTTP/provider | Precio observado | Mapping |
|---|---|---:|---:|---|
| Carrefour | OK | 1.935 ms | $2.788,50 | EXACT_PICKUP / BRANCH_CONFIRMED |
| Vea | OK | 1.999 ms | $4.990,00 | NEAREST_BRANCH_ASSUMPTION / ONLINE_CHAIN |
| ChangoMás | OK | 1.321 ms | $4.349,00 | NEAREST_BRANCH_ASSUMPTION / ONLINE_CHAIN |

Valores del smoke de aproximadamente 10:19, Argentina. No afirman precios actuales.
Carrefour confirmó compra online con retiro; góndola no confirmada. Las otras dos
mostraron disponibilidad online y una sucursal real candidata, sin confirmar precio
ni disponibilidad en ese local. El smoke no escribió la base.

La validación de persistencia posterior guardó tres observaciones y un producto
descubierto. En el primer intento apareció una carrera de upserts simultáneos de
ese EAN: un guardado falló y necesitó otra consulta. Se corrigió usando el upsert
nativo PostgreSQL. Se verificó el SQL real mediante una transacción revertida,
sin modificar el producto; no se repitió una primera creación de otro producto.

La repetición con caché dio **HIT en las tres cadenas**: Carrefour 57 ms, Vea 114 ms,
ChangoMás 105 ms, sin nuevas llamadas HTTP y conservando la fecha de las observaciones
(aproximadamente 10:21). La evidencia de HIT se capturó a las 10:24; el control final
de backend se hizo más tarde y no repitió consultas a retailers.

SEPA se conservó: **3.303 ofertas reales, 15 DEMO**. Directorio de sucursales reales:
81 (59 con ofertas SEPA y 22 ChangoMás agregadas desde sucursales.csv oficial).
No se importaron precios antiguos de ChangoMás. Total Product: 68, uno liveOnly.

Con flag OFF, la respuesta de negocio de Coca Zero fue idéntica a la búsqueda
estable; Magistral liveOnly no apareció. La caída de providers y fallback SEPA se
probaron con mocks. No se provocaron caídas reales ni se llamaron OpenAI/WhatsApp.

Validación final: **106 tests aprobados, 0 fallidos; TypeScript y build PASS**.
`/health` HTTP 200; `/search` HTTP 200 con 11 ofertas REAL:SEPA, sin providers live.

Archivos:

- [Smoke real](smoke.json): una consulta por cadena, sin persistencia.
- [Caché, conteos, OFF y ejemplo completo](internal-verification.json).
- [Prueba del upsert nativo sin cambios persistidos](native-upsert.json).
- [Tests, build, health y conteos finales](final-verification.json).

Reproducción: `npm test`, `npm run typecheck`, `npm run build`; para nueva evidencia
HTTP, `npm run live:smoke` (puede cambiar el precio o producir WARN). Configuración
y límites: [LIVE-SEARCH](../../docs/LIVE-SEARCH.md). El flag local permanece OFF.
