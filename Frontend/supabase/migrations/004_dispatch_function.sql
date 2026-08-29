-- =========================================================
-- Migración 004: Función de asignación de despachos
-- =========================================================

-- ---------------------------------------------------------
-- asignar_despacho()
--
-- Encuentra el recurso disponible MÁS CERCANO (misma ciudad) a una
-- emergencia, lo marca como no disponible, cambia el estado de la
-- emergencia a 'despachado' y crea el registro de despacho — todo en
-- UNA sola transacción atómica.
--
-- "FOR UPDATE SKIP LOCKED" es clave para la resiliencia bajo carga:
-- si llegan 50 solicitudes de despacho al mismo tiempo (varias Lambdas
-- ejecutando en paralelo, como ocurriría en un pico de tráfico real),
-- Postgres evita que dos despachos distintos le asignen la MISMA
-- cuadrilla dos veces. Cada transacción "salta" los recursos que otra
-- transacción ya está bloqueando, en vez de esperar y crear un cuello
-- de botella.
-- ---------------------------------------------------------
create or replace function public.asignar_despacho(
  p_emergencia_id uuid,
  p_operador_id uuid default null
)
returns public.despachos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ciudad ciudad_nodo;
  v_estado estado_emergencia;
  v_ubicacion geography;
  v_recurso_id uuid;
  v_despacho public.despachos;
begin
  -- Bloquea la fila de la emergencia para evitar despachos duplicados
  -- concurrentes sobre la MISMA emergencia.
  select ciudad, estado, ubicacion
    into v_ciudad, v_estado, v_ubicacion
    from public.emergencias
    where id = p_emergencia_id
    for update;

  if v_ciudad is null then
    raise exception 'emergencia_no_encontrada' using errcode = 'P0001';
  end if;

  if v_estado not in ('recibido', 'en_triage') then
    raise exception 'emergencia_ya_despachada' using errcode = 'P0002';
  end if;

  -- Busca el recurso disponible más cercano en la misma ciudad.
  select r.id
    into v_recurso_id
    from public.recursos r
    where r.disponible = true
      and r.ciudad = v_ciudad
    order by r.ubicacion <-> v_ubicacion
    limit 1
    for update skip locked;

  if v_recurso_id is null then
    raise exception 'sin_recursos_disponibles' using errcode = 'P0003';
  end if;

  update public.recursos
    set disponible = false
    where id = v_recurso_id;

  update public.emergencias
    set estado = 'despachado'
    where id = p_emergencia_id;

  insert into public.despachos (emergencia_id, recurso_id, operador_id, estado)
  values (p_emergencia_id, v_recurso_id, p_operador_id, 'asignado')
  returning * into v_despacho;

  return v_despacho;
end;
$$;

comment on function public.asignar_despacho is
'Asigna atómicamente el recurso disponible más cercano a una emergencia.
Códigos de error custom (via errcode P0001-P0003) para que el microservicio
los traduzca a respuestas HTTP específicas: 404 (no existe), 409 (ya
despachada o sin recursos).';