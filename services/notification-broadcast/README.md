# Notification & Status Broadcast Microservice

Transmite actualizaciones de estado de una emergencia a organismos
externos vía webhooks HTTP, y deja constancia de cada notificación
(exitosa o fallida) en la tabla `notificaciones`.

No necesita ninguna migración nueva — usa la tabla `notificaciones`
creada desde la migración 001.

## Cómo encaja con Supabase Realtime

El **dashboard de operadores** (frontend) se actualiza en vivo usando
las suscripciones Realtime de Supabase directamente sobre la tabla
`emergencias` — no necesita pasar por este microservicio para eso.

Este microservicio es específicamente para el otro caso: avisar a
**sistemas externos** (Cruz Roja, Bomberos, cualquier integración de un
organismo) que no están escuchando Supabase Realtime, vía webhooks HTTP
tradicionales — tal como lo pide el enunciado (sección 4.1, Service 4).

## Probar localmente

1. `npm install`
2. `cp .env.local.example .env.local` y rellena tu Service Role Key.
3. En `test/local-test.mjs`, reemplaza `EMERGENCIA_ID_DE_PRUEBA` por el
   `id` de una emergencia real que ya tengas.
4. Carga variables y corre (PowerShell):
   ```powershell
   Get-Content .env.local | ForEach-Object {
     if ($_ -match '^([^#=]+)=(.*)$') {
       [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
     }
   }
   npm run test:local
   ```

## Qué hace cada test del script

- **Test 1**: no manda ningún webhook externo — solo registra en
  `notificaciones` que ocurrió el evento (canal `realtime`). Debe dar
  `Status: 200`.
- **Test 2**: envía un webhook real a `https://httpbin.org/post` (un
  servicio público gratuito que solo "hace eco" de lo que recibe, útil
  para probar sin montar tu propio servidor). Debe dar `Status: 200` con
  `exito: true` en el resultado.
- **Test 3**: intenta enviar a un dominio que no existe, a propósito,
  para comprobar que un webhook fallido NO tumba la respuesta general —
  debe dar `Status: 200` igual, pero con `exito: false` y un mensaje de
  error en ese resultado puntual. Esto demuestra manejo de fallos
  parciales sin que un solo destinatario caído afecte a los demás.

## Qué revisar en Supabase después

Tabla `notificaciones` → deberías ver varias filas nuevas: una con
`canal: 'realtime'` (Test 1), y dos con `canal: 'webhook'` (Test 2 y 3),
donde el payload de cada una incluye si fue exitosa o no.
