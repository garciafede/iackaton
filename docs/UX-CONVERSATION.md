# UX de la conversación

Los pedidos «más barato/a», «dónde conviene» y «menor precio» imponen orden por
precio ascendente en código, independientemente del criterio elegido por OpenAI.
«¿Y la más barata?» reutiliza el último producto; el carrito se conserva para
seguimientos equivalentes. Una nueva búsqueda individual deja el carrito en segundo
plano; «compra anterior», «carro anterior» y «lo anterior» permiten recuperarlo.
Los resultados individuales quedan en la sesión para contestar preguntas sobre
sucursales y distancias sin otra inferencia. Cambiar GPS descarta esos resultados.
Si el nuevo GPS difiere menos de 50 metros, se informa que es prácticamente el mismo
punto; aun así, se guardan las coordenadas nuevas y se recalcula en la próxima búsqueda.

WhatsApp conserva ubicación, búsqueda, carrito y criterio **por remitente**, con
el TTL existente de 30 minutos de inactividad. Los mensajes del mismo remitente
se procesan en orden para evitar que dos respuestas sobrescriban el contexto.
Las sesiones siguen en memoria: una réplica y nueva ubicación después de reiniciar.

Las listas admiten líneas con cantidades enteras, hasta 10 productos y 99 unidades
por producto. Se consultan los providers existentes para cada artículo, de a dos
productos concurrentes. Los totales usan centavos y multiplican por cantidad.
Cada comparación exige una misma sucursal y canal de compra: no suma mínimos de
sucursales distintas ni mezcla retiro, precio de cadena y góndola como una compra
única. Si falta un artículo, muestra «no encontrado» y total parcial; nunca gana
contra un carrito completo. EAN/presentaciones ambiguos requieren aclaración.

El resultado ganador significa menor total **entre los carritos completos con
precios encontrados**. No asegura stock físico, promociones personales ni costo
de envío. WhatsApp muestra una nota corta; el detalle de fuentes, EAN y fecha se
conserva y puede pedirse con «mostrame las fuentes» o «detalles».

Para direcciones, admite «Italia 4320», «Mi ubicación es Italia 4320» y «Cambiar
ubicación a Italia 4320». «Cambiar ubicación» inicia el reemplazo: la ubicación
anterior se conserva hasta obtener otra válida. Se puede indicar
`calle número, ciudad/localidad, provincia`; no hay ciudad ni provincia por defecto.
Primero consulta Georef con los datos escritos. Si no obtiene una dirección única,
pregunta «¿En qué localidad o ciudad es?» y luego, si hace falta, «¿En qué provincia?».
Conserva las aclaraciones en la sesión y vuelve a consultar. Si aún no puede resolverla
con confianza, ofrece GPS; no elige un resultado arbitrariamente.

Geocodificación: [Georef, normalización de direcciones](https://georef-ar-api.readthedocs.io/es/stable/addresses/).
La dirección se envía al servicio público `apis.datos.gob.ar`, sin teléfono ni
credenciales. Se aceptan únicamente coordenadas devueltas para una altura
coincidente; son aproximadas según la fuente. No se sustituyen por centroides de
ciudad ni coordenadas inventadas. Timeout de 8 segundos; si falla, pide GPS.
No requiere otra API key. La cobertura depende de los datos de Georef.

Tests offline: `tests/ux.test.ts`, incluidos en `npm test`. Las coordenadas,
direcciones e importes de sus fixtures son sintéticos; no representan ofertas reales.
