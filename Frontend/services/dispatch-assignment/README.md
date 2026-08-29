# Dispatch & Assignment Microservice

Asigna atómicamente el recurso (cuadrilla) disponible más cercano a una
emergencia, y permite actualizar el estado del despacho a lo largo del
tiempo (en camino, en sitio, completado, cancelado).

## Antes de probar: aplica la migración 004

Este servicio depende de la función `asignar_despacho()` en Postgres.
Aplícala igual que las anteriores (SQL Editor o `supabase db push`):
`supabase/migrations/004_dispatch_function.sql`

## Antes de probar: necesitas datos de prueba

1. Una emergencia existente con `estado = 'recibido'` (usa el `id` que te
   devolvió el microservicio intake-triage al probarlo, o crea una nueva
   directo en el SQL Editor).
2. Al menos un recurso disponible en la MISMA ciudad que esa emergencia:
   ```sql
   insert into public.recursos (nombre, tipo_unidad, organismo, ciudad, ubicacion, disponible)
   values (
     'Cuadrilla Rescate Cali 1', 'rescate', 'Bomberos', 'cali',
     st_setsrid(st_makepoint(-76.53, 3.45), 4326)::geography,
     true
   );
   ```

## Probar localmente

1. `npm install`
2. `cp .env.local.example .env.local` y rellena tu Service Role Key.
3. En `test/local-test.mjs`, reemplaza `EMERGENCIA_ID_DE_PRUEBA` por el
   `id` real de tu emergencia de prueba.
4. Carga las variables y corre el test (PowerShell):
   ```powershell
   Get-Content .env.local | ForEach-Object {
     if ($_ -match '^([^#=]+)=(.*)$') {
       [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
     }
   }
   npm run test:local
   ```

Deberías ver:
- **Test 1**: `Status: 201`, un despacho creado con `recurso_id` apuntando
  a la cuadrilla que sembraste.
- **Test 2**: `Status: 200`, el mismo despacho ahora con `estado: "en_camino"`.

## Qué revisar en Supabase después de la prueba

- Tabla `despachos`: debe tener la fila nueva.
- Tabla `recursos`: el recurso asignado debe tener `disponible = false`.
- Tabla `emergencias`: la emergencia debe tener `estado = 'despachado'`.

## Prueba de concurrencia (opcional, pero buena evidencia para la rúbrica)

Corre el test dos veces seguidas MUY rápido (o desde dos terminales a la
vez) contra la misma emergencia. Solo una debe tener éxito (201); la otra
debe fallar con 409 `"La emergencia ya fue despachada previamente"` — así
demuestras que la función atómica en Postgres evita condiciones de
carrera bajo carga concurrente, algo central en el argumento de
"arquitectura resiliente" del enunciado.
