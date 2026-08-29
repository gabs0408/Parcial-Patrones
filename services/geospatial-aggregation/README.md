# Geospatial & Zone Aggregation Microservice

Agrupa las emergencias activas de una ciudad en clusters geográficos
(puntos calientes) y detecta zonas donde no hay ningún recurso disponible
cerca (zonas aisladas).

## Antes de probar: aplica la migración 005

`supabase/migrations/005_geospatial_functions.sql` — dos funciones SQL:
- `agrupar_emergencias_por_zona(ciudad, tamano_grid)` — clustering basado
  en grilla (determinístico, sin aleatoriedad).
- `detectar_zonas_aisladas(ciudad, radio_metros)` — emergencias sin
  ningún recurso disponible dentro del radio dado.

## Antes de probar: necesitas varias emergencias en una misma ciudad

Con solo 1 o 2 emergencias verás clusters, pero para que se note el
agrupamiento real, siembra 3-4 emergencias cercanas entre sí en la misma
ciudad (puedes correr el test de intake-triage varias veces cambiando
`idempotency_key` y las coordenadas, o insertarlas directo en SQL Editor).

## Probar localmente

1. `npm install`
2. `cp .env.local.example .env.local` y rellena tu Service Role Key.
3. En `test/local-test.mjs`, ajusta la ciudad si no usaste "cali".
4. Carga variables y corre (PowerShell):
   ```powershell
   Get-Content .env.local | ForEach-Object {
     if ($_ -match '^([^#=]+)=(.*)$') {
       [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
     }
   }
   npm run test:local
   ```

## Qué esperar en la respuesta

```json
{
  "ciudad": "cali",
  "clusters": [
    {
      "centro_lat": 3.4516,
      "centro_lng": -76.532,
      "cantidad": 3,
      "prioridad_mas_alta": "P1",
      "emergencia_ids": ["...", "...", "..."]
    }
  ],
  "zonas_aisladas": [ /* emergencias sin recursos cercanos */ ],
  "parametros": { "tamano_grid": 0.01, "radio_aislamiento_metros": 5000 }
}
```

Si `zonas_aisladas` sale vacío pero esperabas ver algo ahí, revisa que
tus emergencias de prueba estén razonablemente lejos (>5km) de cualquier
recurso `disponible = true` en esa ciudad — si sembraste el recurso de
Cali muy cerca de todas tus emergencias de Cali, es normal que no
aparezca ninguna zona aislada.
