-- =========================================================
-- Migración 001: Esquema base del sistema de gestión de emergencias
-- =========================================================

-- ---------------------------------------------------------
-- Extensiones necesarias
-- ---------------------------------------------------------
create extension if not exists postgis;
create extension if not exists pgcrypto; -- para gen_random_uuid()

-- ---------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------

create type tipo_emergencia as enum (
  'usar_medica',           -- Búsqueda y Rescate / Emergencia Médica (P1)
  'albergue',               -- Albergue y Refugio Temporal (P2)
  'suministros',            -- Suministros Básicos y Asistencia Humanitaria (P3)
  'danos_estructurales'     -- Evaluación de Daños Estructurales (P4)
);

create type prioridad_triage as enum ('P1', 'P2', 'P3', 'P4');

create type ciudad_nodo as enum ('choco', 'pereira', 'cali', 'manizales');

create type estado_emergencia as enum (
  'recibido',
  'en_triage',
  'despachado',
  'en_progreso',
  'resuelto',
  'cancelado'
);

create type rol_usuario as enum ('ciudadano', 'operador', 'admin');

create type estado_despacho as enum (
  'asignado',
  'en_camino',
  'en_sitio',
  'completado',
  'cancelado'
);

-- ---------------------------------------------------------
-- TABLA: usuarios
-- Extiende auth.users de Supabase con rol y ciudad asignada
-- ---------------------------------------------------------
create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  rol rol_usuario not null default 'ciudadano',
  ciudad_asignada ciudad_nodo,        -- solo aplica a operadores (null = todas las ciudades)
  nombre_completo text,
  organismo text,                     -- Cruz Roja, Bomberos, Defensa Civil, UNGRD, etc.
  creado_at timestamptz not null default now()
);

comment on table public.usuarios is 'Perfil extendido de auth.users con rol y zona asignada';

-- ---------------------------------------------------------
-- TABLA: zonas
-- Metadatos de cada uno de los 4 nodos geográficos
-- ---------------------------------------------------------
create table public.zonas (
  id smallint primary key generated always as identity,
  ciudad ciudad_nodo not null unique,
  centro geography(Point, 4326) not null,   -- punto de referencia del centro urbano
  radio_cobertura_km numeric not null default 30
);

-- ---------------------------------------------------------
-- TABLA: emergencias
-- Núcleo del dominio: toda solicitud ciudadana
-- ---------------------------------------------------------
create table public.emergencias (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_emergencia not null,
  prioridad prioridad_triage not null,
  ciudad ciudad_nodo not null,
  ubicacion geography(Point, 4326) not null,
  descripcion text,
  estado estado_emergencia not null default 'recibido',

  -- Datos específicos por tipo de solicitud (flexible, ver sección "datos" abajo)
  datos jsonb not null default '{}'::jsonb,

  -- Trazabilidad
  creado_por uuid references public.usuarios(id),
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  -- Idempotencia: evita solicitudes duplicadas del mismo dispositivo/cliente en ventanas cortas
  idempotency_key text unique
);

create index idx_emergencias_ciudad on public.emergencias (ciudad);
create index idx_emergencias_estado on public.emergencias (estado);
create index idx_emergencias_prioridad on public.emergencias (prioridad);
create index idx_emergencias_ubicacion on public.emergencias using gist (ubicacion);
create index idx_emergencias_creado_por on public.emergencias (creado_por);

comment on column public.emergencias.datos is
'JSONB con campos específicos según "tipo". Ejemplos:
 usar_medica: {"personas_atrapadas": 3, "heridos": 1, "riesgo_inminente": ["fuga_gas"]}
 albergue: {"adultos": 4, "ninos": 2, "tercera_edad": 1, "requiere_accesibilidad": true, "vivienda_habitable": false}
 suministros: {"categoria": "agua_potable", "cantidad_estimada": 20}
 danos_estructurales: {"tipo_edificacion": "residencial", "nivel_agrietamiento": "severo", "riesgo_colapso_via": true, "fotos": ["url1","url2"]}';

-- ---------------------------------------------------------
-- TABLA: recursos (unidades/cuadrillas de respuesta)
-- ---------------------------------------------------------
create table public.recursos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo_unidad text not null,           -- 'rescate', 'ambulancia', 'bomberos', 'logistica', etc.
  organismo text,                      -- Cruz Roja, Bomberos, Defensa Civil, UNGRD
  ciudad ciudad_nodo not null,
  ubicacion geography(Point, 4326) not null,
  disponible boolean not null default true,
  actualizado_at timestamptz not null default now()
);

create index idx_recursos_ciudad on public.recursos (ciudad);
create index idx_recursos_disponible on public.recursos (disponible);
create index idx_recursos_ubicacion on public.recursos using gist (ubicacion);

-- ---------------------------------------------------------
-- TABLA: despachos (asignación de recursos a emergencias)
-- ---------------------------------------------------------
create table public.despachos (
  id uuid primary key default gen_random_uuid(),
  emergencia_id uuid not null references public.emergencias(id) on delete cascade,
  recurso_id uuid not null references public.recursos(id),
  operador_id uuid references public.usuarios(id),
  estado estado_despacho not null default 'asignado',
  asignado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

create index idx_despachos_emergencia on public.despachos (emergencia_id);
create index idx_despachos_recurso on public.despachos (recurso_id);
create index idx_despachos_estado on public.despachos (estado);

-- ---------------------------------------------------------
-- TABLA: notificaciones (log de eventos enviados)
-- ---------------------------------------------------------
create table public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  emergencia_id uuid not null references public.emergencias(id) on delete cascade,
  canal text not null,                 -- 'webhook', 'realtime', 'email', etc.
  payload jsonb not null,
  enviado_at timestamptz not null default now()
);

create index idx_notificaciones_emergencia on public.notificaciones (emergencia_id);

-- ---------------------------------------------------------
-- Trigger genérico: actualizar "actualizado_at"
-- ---------------------------------------------------------
create or replace function public.set_actualizado_at()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_at = now();
  return new;
end;
$$;

create trigger trg_emergencias_actualizado
before update on public.emergencias
for each row execute function public.set_actualizado_at();

create trigger trg_despachos_actualizado
before update on public.despachos
for each row execute function public.set_actualizado_at();

create trigger trg_recursos_actualizado
before update on public.recursos
for each row execute function public.set_actualizado_at();
