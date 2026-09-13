# Arrancar la demo después de reiniciar Windows

**Terminal 1 — PowerShell, dejar abierta:**

```powershell
cd C:\git\iackaton
nvm use 24.20.0
npm run demo:check
npm run dev
```

Si Windows no reconoce `nvm`, el ejecutable instalado es:
`& "$env:APPDATA\nvm\nvm.exe" use 24.20.0`.

Si faltan `node_modules` o el cliente Prisma, ejecutar antes `npm ci` y
`npm run db:generate`. No ejecutar `db:seed` ni resetear la base.

**Modo seguro:** `LIVE_RETAILER_SEARCH=false` en `.env` (también es el default).
Para probar el HITO 2, usar `true` y reiniciar el backend; ver [LIVE-SEARCH](LIVE-SEARCH.md).
Al instalar esta versión en otra copia, aplicar primero `npx --no-install prisma migrate deploy`
y `npm run db:generate`, con el backend detenido. No repetirlo en cada arranque.

El pre-check debe terminar sin `ERROR`. Los `WARN` de las cadenas son esperables
sin mapping físico; debe haber ofertas reales elegibles en Neon.
`OpenAI OK` comprueba acceso al modelo; **revisar el saldo en el panel OpenAI**.
`WhatsApp config OK` comprueba acceso con el token; todavía falta probar el envío.
Si Meta devuelve 401 o código 190, renovar el token en Meta, guardarlo únicamente
en `.env`, reiniciar `npm run dev` y repetir el check.

**Terminal 2 — PowerShell, dejar abierta:**

```powershell
ngrok http 3000
```

Si Windows no reconoce `ngrok`, usar el alias instalado:
`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\ngrok.exe" http 3000`.

**Verificar y probar:**

1. Abrir `http://localhost:3000/health`: debe mostrar `{"status":"ok"}`.
   Este endpoint comprueba el backend; Neon se comprueba con `demo:check`.
2. Copiar la URL **HTTPS** de ngrok. Si cambió, actualizar en la app de Meta:
   **WhatsApp → Configuración → Webhooks → Callback URL** =
   `https://TU-DOMINIO-NGROK/webhooks/whatsapp`. Usar el verify token ya guardado
   localmente y comprobar la suscripción al campo `messages`.
3. Desde el celular autorizado, enviar **«Buscame Coca Zero y quiero la más barata»**.
4. Compartir ubicación cuando el bot la pida. Deben aparecer ofertas reales con
   precio, dirección, distancia, fuente y fecha; stock desconocido se muestra
   como **«disponibilidad no confirmada»**.
5. Probar **«Quiero la más cercana»**: debe conservar Coca Zero y reordenar.

El radio predeterminado es **25 km**. Si no hay cobertura, es correcto recibir
una respuesta sin ofertas. Para ensayar sin límite, enviar una consulta completa:
**«Buscame Coca Zero, no importa la distancia, quiero la más barata»**.
Nunca presentar una tienda lejana como cercana.

Reiniciar el backend borra las sesiones en memoria (también vencen tras 30 minutos
de inactividad). Para grabar la solicitud de ubicación, reiniciarlo antes de empezar.
En desarrollo se conserva la normalización argentina ya verificada; el destinatario
de prueba debe seguir registrado en Meta con ese formato.

Si el puerto 3000 está ocupado, cerrar la instancia anterior propia con `Ctrl+C`.
Para detener la demo: `Ctrl+C` en las dos terminales. No mostrar `.env`, paneles
de credenciales, teléfonos completos ni coordenadas personales en la grabación.
