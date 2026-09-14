# Estado e historial de conversación

La sesión conserva por separado `location`, `lastProduct`, `lastProductResults`,
`currentCart`, `cartResults`, `sortCriterion` y `pendingAction`. `activeSubject`
indica a qué se refiere un seguimiento sin nombre; consultar un producto no borra
el carrito. Las referencias explícitas a la compra usan el carrito guardado.

El router resuelve intents antes de buscar precios. Usa señales de intención,
referencias y estado; las consultas de productos siguen usando el agente existente.
Mostrar el carrito no consulta precios. Modificar un artículo ausente pide confirmar
si se agrega. Una búsqueda fallida conserva todos los artículos y cantidades.

GPS reemplaza ambas coordenadas e invalida resultados de la ubicación anterior.
Una diferencia menor a 50 metros genera el aviso de punto prácticamente igual.
Mostrar el carrito no cancela una ubicación pendiente. «No es la misma» explica
lo recibido y solicita seleccionar otro punto manualmente.

## Historial persistente

Aplicar migraciones y regenerar cliente en el despliegue:

```sh
npm run db:generate
npx prisma migrate deploy
```

`ConversationLog` conserva IN/OUT, texto depurado, intent, criterio, resumen de
estado y latencia. El GPS se guarda como lat/lng JSON. No se guarda payload binario,
credenciales ni el teléfono como identificador: cada sesión recibe un UUID.
Stdout emite eventos JSON de diagnóstico sin contenido privado de los mensajes.
Si el registro falla, se emite `conversation.log_unavailable`; el bot sigue atendiendo.

```sh
npm run chat:logs -- --limit 100
npm run chat:logs -- --limit 100 --session UUID
```

El comando muestra los últimos registros en orden cronológico. Las coordenadas
permanecen estructuradas en la base; la salida muestra «GPS recibido».
Los logs sobreviven a reinicios/Railway. El estado activo continúa en memoria,
con el TTL existente de 30 minutos; no se reconstruye automáticamente desde logs.

Regresiones: `tests/fixtures/chat4.ts` conserva los textos del export y reemplaza
los GPS personales por datos sintéticos. `tests/conversation-state.test.ts` verifica
intents, estado por turno, cantidad, modificaciones, matching y sanitización.
