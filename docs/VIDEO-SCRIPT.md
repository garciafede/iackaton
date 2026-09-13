# Video de respaldo — duración objetivo 2:45, máximo 3:00

Antes de grabar: seguir [START-DEMO](START-DEMO.md), ejecutar el pre-check,
actualizar SEPA, hacer una prueba desde el celular y reiniciar el backend para
vaciar la sesión. Ocultar notificaciones, teléfonos, credenciales y ubicación personal.
Preparar una ubicación pública dentro de la cobertura y explicar que es la del ensayo.
Usar precios y fechas que aparezcan en esa ejecución, sin fijarlos en el guion.

| Tiempo | Pantalla y narración |
|---|---|
| 0:00–0:20 | WhatsApp. «Esta PoC busca ofertas registradas de un producto y las ordena según nuestra ubicación». Enviar: **Buscame Coca Zero y quiero la más barata**. |
| 0:20–0:40 | Mostrar la solicitud del bot: necesita ubicación para calcular distancias. |
| 0:40–1:00 | Compartir la ubicación pública preparada desde WhatsApp. Evitar mostrar domicilio o coordenadas personales. |
| 1:00–1:40 | Mostrar la respuesta. Señalar producto/presentación, precio, sucursal/dirección, distancia en línea recta, fuente y fecha de verificación. Leer «disponibilidad no confirmada» si figura. Aclarar radio de 25 km y antigüedad si corresponde. |
| 1:40–2:00 | Breve vistazo a logs actuales: recepción, procesamiento correcto y destinatario enmascarado. No abrir `.env`, cuerpos del webhook, inspector de ngrok ni logs históricos sin revisar. |
| 2:00–2:25 | «SEPA aporta datos oficiales. Los proveedores Playwright consultan solo cinco productos de Carrefour, Vea y ChangoMás antes de la demo. Un precio web solo se importa si podemos identificar producto y sucursal. Actualmente esos mappings físicos siguen pendientes; la respuesta usa SEPA». |
| 2:25–2:45 | «OpenAI interpreta el pedido mediante function calling. `findProductOffers` consulta PostgreSQL y calcula distancias. El código forma los precios, disponibilidad y fechas directamente con esos resultados; no utiliza texto libre del modelo para inventarlos». |

Guardar el video localmente, por ejemplo `demo-backup.mp4`, y reproducirlo completo
sin Internet. Copiarlo a un segundo dispositivo. Este archivo contiene el guion;
la grabación debe hacerse manualmente y confirmarse antes de presentar.
