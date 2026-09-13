# Checklist de la versión candidata

## 24 horas antes

- [ ] Mantener Node 24.20.0 y `package-lock.json`; no actualizar dependencias.
- [ ] `npm test`, `npm run typecheck`, `npm run build`: todos correctos.
- [ ] `npm run demo:check`: sin ERROR; revisar WARN y cantidades reales.
- [ ] Revisar saldo/límites del proyecto OpenAI en su panel (el check no mide saldo).
- [ ] Confirmar token WhatsApp vigente, destinatario permitido y configuración Meta.
- [ ] Neon accesible, migraciones existentes aplicadas; no resetear ni generar DEMO.
- [ ] Actualizar precios con `npm run prices:sepa -- --dry-run` y, tras revisar
      fecha/fuente y advertencias, `npm run prices:sepa`.
- [ ] Revisar `npm run prices:scrape -- --dry-run`. Si hay CAPTCHA/bloqueo, detener
      esa cadena. Sin mapping físico comprobado, conservar SEPA y registrar WARN.
      Ejecutar `npm run prices:scrape` solo si el dry-run tiene observaciones
      importables con EAN y sucursal; no repetir scraping sin necesidad.
- [ ] Repetir `demo:check`: cinco grupos y ofertas elegibles. Las ofertas no vistas
      en el refresh se conservan con su fecha original; no se rejuvenecen.
- [ ] Prueba desde celular en una zona con cobertura real; verificar precio,
      distancia, fuente, fecha y disponibilidad desconocida.
- [ ] Grabar el [video de respaldo](VIDEO-SCRIPT.md), reproducirlo y copiarlo a otro dispositivo.
- [ ] Conservar una copia del código, lockfile, docs y evidencia; mantener `.env` privado.

## 2 horas antes

- [ ] Seguir [START-DEMO](START-DEMO.md): backend y ngrok levantados.
- [ ] Actualizar Callback URL en Meta si cambió ngrok; suscripción `messages` activa.
- [ ] `/health` responde y `demo:check` confirma Neon, OpenAI y token Meta.
- [ ] Revisar saldo OpenAI nuevamente; no hacer ensayos automáticos pagos.
- [ ] Confirmar fecha de precios; actualizar SEPA si hay una publicación nueva.
- [ ] Prueba completa desde el celular: texto → ubicación → ofertas reales.
- [ ] Confirmar radio/cobertura. Si se ensaya sin límite, decirlo explícitamente.
- [ ] Video backup disponible localmente; cargadores e Internet listos.

## 15 minutos antes

- [ ] Backend, ngrok, webhook y token siguen vigentes; `/health` responde.
- [ ] `demo:check` sin ERROR y con ofertas reales elegibles en Neon.
- [ ] Una prueba breve desde el celular funciona; después reiniciar el backend
      para comenzar la presentación sin una ubicación guardada.
- [ ] Abrir WhatsApp y logs nuevos sin secretos; cerrar `.env` y notificaciones.
- [ ] Abrir el video backup y comprobar reproducción; no depender de una descarga.
- [ ] No actualizar dependencias, migrar, cambiar mappings ni raspar sitios a último momento.
- [ ] Si falla un ecommerce, continuar con PostgreSQL. Si falla el circuito
      WhatsApp/OpenAI/Neon, mostrar el video e informar la limitación real.
