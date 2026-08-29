-- =========================================================
-- Migración 005: Agrupamiento geoespacial (clustering) y
-- detección de zonas aisladas
-- =========================================================

-- ---------------------------------------------------------
-- agrupar_emergencias_por_zona()
--
-- Clustering DETERMINÍSTICO basado en grilla (grid-based clustering):
-- divide el mapa en celdas de tamaño fijo (p_tamano_grid, en grados) y
-- agrupa las emergencias que caen en la misma celda. Es una técnica
-- mucho más simple que k-means o DBSCAN, pero con una ventaja clave
-- para este dominio: es 100% determinística y reproducible (mismos
-- datos -> mismos clusters, siempre), algo que un algoritmo con
-- inicialización aleatoria no garantiza. Suficiente para detectar
-- "puntos calientes" (zonas con muchos reportes concentrados).
--
-- p_tamano_grid en grados decimales: ~0.01 grados equivale aprox. a
-- 1.1 km en latitudes cercanas al ecuador (como Colombia).
-- ---------------------------------------------------------
create or replace function public.agrupar_emergencias_por_zona(
  p_ciudad ciudad_nodo,
  p_tamano_grid numeric default 0.01
)
returns table (
  centro_lat double precision,
  centro_lng double precision,
  cantidad bigint,
  prioridad_mas_alta prioridad_triage,
  emergencia_ids uuid[]
)
language sql
stable
set search_path = public
as $$
  select
    st_y(st_centroid(st_collect(ubicacion::geometry))) as centro_lat,
    st_x(st_centroid(st_collect(ubicacion::geometry))) as centro_lng,
    count(*) as cantidad,
    min(prioridad) as prioridad_mas_alta, -- el enum ordena P1 < P2 < P3 < P4
    array_agg(id) as emergencia_ids
  from public.emergencias
  where ciudad = p_ciudad
    and estado not in ('resuelto', 'cancelado')
  group by st_snaptogrid(ubicacion::geometry, p_tamano_grid)
  order by cantidad desc, prioridad_mas_alta asc;
$$;

comment on function public.agrupar_emergencias_por_zona is
'Agrupa emergencias activas de una ciudad en clusters basados en grilla
para detectar puntos calientes de colapso. Determinístico y reproducible.';

-- ---------------------------------------------------------
-- detectar_zonas_aisladas()
--
-- Encuentra emergencias activas que NO tienen ningún recurso disponible
-- dentro de un radio dado (por defecto 5km) — es decir, zonas donde,
-- si se despachara ahora mismo, no habría ninguna cuadrilla cercana
-- capaz de responder rápido.
-- ---------------------------------------------------------
create or replace function public.detectar_zonas_aisladas(
  p_ciudad ciudad_nodo,
  p_radio_metros integer default 5000
)
returns setof public.emergencias
language sql
stable
set search_path = public
as $$
  select e.*
  from public.emergencias e
  where e.ciudad = p_ciudad
    and e.estado in ('recibido', 'en_triage')
    and not exists (
      select 1
      from public.recursos r
      where r.ciudad = p_ciudad
        and r.disponible = true
        and st_dwithin(r.ubicacion, e.ubicacion, p_radio_metros)
    );
$$;

comment on function public.detectar_zonas_aisladas is
'Emergencias activas sin ningún recurso disponible dentro del radio dado.
Útil para alertar a coordinación central sobre zonas desatendidas.';
