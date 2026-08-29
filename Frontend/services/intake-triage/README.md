# Intake & Triage Microservice

Recibe reportes ciudadanos, valida el payload, calcula la prioridad de
triage de forma determinística, y persiste la emergencia en Supabase con
protección de idempotencia.

## Probar localmente (sin Docker, sin AWS)

1. Instala dependencias:
   ```bash
   cd services/intake-triage
   npm install
   ```

2. Crea tu archivo de entorno local (NO se commitea):
   ```bash
   cp .env.local.example .env.local
   ```
   Rellena `SUPABASE_SERVICE_ROLE_KEY` con la Service Role Key de tu proyecto
   (Project Settings → API → `service_role` — es SECRETA, distinta al anon key
   que ya usamos para probar RLS).

3. Carga las variables y corre el test:
   ```bash
   # PowerShell:
   Get-Content .env.local | ForEach-Object {
     if ($_ -match '^([^#=]+)=(.*)$') {
       [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
     }
   }
   npm run test:local
   ```
   ```bash
   # bash/zsh:
   export $(cat .env.local | xargs)
   npm run test:local
   ```

4. Deberías ver algo como:
   ```
   --- Resultado ---
   Status: 201
   Body: {
     "id": "....",
     "tipo": "usar_medica",
     "prioridad": "P1",
     "ciudad": "cali",
     ...
   }
   ```

5. Verifica en Supabase (Table Editor → `emergencias`) que la fila apareció.

6. Corre `npm run test:local` una segunda vez sin cambiar el `idempotency_key`
   en `test/local-test.mjs` — debería devolver la MISMA fila (status 200) en
   vez de crear un duplicado. Así confirmas que la idempotencia funciona.

## Siguiente paso: Dockerizar y probar con el emulador de Lambda

Una vez el test local pase, construimos la imagen y la probamos como si
fuera Lambda de verdad (usando el Runtime Interface Emulator incluido en
la imagen base de AWS) — eso lo hacemos en el siguiente mensaje.
