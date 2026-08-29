-- =========================================================
-- Migración 002: Row Level Security (RLS)
-- =========================================================

-- ---------------------------------------------------------
-- Función auxiliar: obtener el rol del usuario autenticado
-- SECURITY DEFINER para poder leer public.usuarios sin recursión de RLS
-- ---------------------------------------------------------
create or replace function public.rol_actual()
returns rol_usuario
language sql
security definer
stable
set search_path = public
as $$
  select rol from public.usuarios where id = auth.uid();
$$;

create or replace function public.ciudad_asignada_actual()
returns ciudad_nodo
language sql
security definer
stable
set search_path = public
as $$
  select ciudad_asignada from public.usuarios where id = auth.uid();
$$;

-- ---------------------------------------------------------
-- Habilitar RLS en todas las tablas de negocio
-- ---------------------------------------------------------
alter table public.usuarios enable row level security;
alter table public.emergencias enable row level security;
alter table public.recursos enable row level security;
alter table public.despachos enable row level security;
alter table public.notificaciones enable row level security;
alter table public.zonas enable row level security;

-- ---------------------------------------------------------
-- USUARIOS: cada quien ve y edita su propio perfil.
-- Operadores/admin pueden ver todos los perfiles (útil para asignar despachos).
-- ---------------------------------------------------------
create policy "usuarios_select_propio_o_staff"
on public.usuarios for select
using (
  id = auth.uid()
  or public.rol_actual() in ('operador', 'admin')
);

create policy "usuarios_update_propio"
on public.usuarios for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "usuarios_insert_propio"
on public.usuarios for insert
with check (id = auth.uid());

-- ---------------------------------------------------------
-- ZONAS: lectura pública para cualquier usuario autenticado
-- ---------------------------------------------------------
create policy "zonas_select_autenticados"
on public.zonas for select
to authenticated
using (true);

-- ---------------------------------------------------------
-- EMERGENCIAS
--  - Ciudadano: solo puede crear e insertar; solo ve/edita las que él creó.
--  - Operador: ve y actualiza las de su ciudad asignada (o todas si ciudad_asignada es null).
--  - Admin: acceso total.
-- ---------------------------------------------------------
create policy "emergencias_select_propias_o_zona"
on public.emergencias for select
using (
  creado_por = auth.uid()
  or public.rol_actual() = 'admin'
  or (
    public.rol_actual() = 'operador'
    and (
      public.ciudad_asignada_actual() is null
      or public.ciudad_asignada_actual() = ciudad
    )
  )
);

create policy "emergencias_insert_ciudadano"
on public.emergencias for insert
with check (
  creado_por = auth.uid()
);

create policy "emergencias_update_operador_zona"
on public.emergencias for update
using (
  public.rol_actual() = 'admin'
  or (
    public.rol_actual() = 'operador'
    and (
      public.ciudad_asignada_actual() is null
      or public.ciudad_asignada_actual() = ciudad
    )
  )
)
with check (
  public.rol_actual() = 'admin'
  or (
    public.rol_actual() = 'operador'
    and (
      public.ciudad_asignada_actual() is null
      or public.ciudad_asignada_actual() = ciudad
    )
  )
);

-- Nota: los ciudadanos NO pueden actualizar el estado de su propia emergencia
-- (evita que alteren el triage o marquen "resuelto" sin validación del operador).

-- ---------------------------------------------------------
-- RECURSOS: solo operadores/admin gestionan las cuadrillas
-- ---------------------------------------------------------
create policy "recursos_select_staff"
on public.recursos for select
using (public.rol_actual() in ('operador', 'admin'));

create policy "recursos_all_admin"
on public.recursos for all
using (public.rol_actual() = 'admin')
with check (public.rol_actual() = 'admin');

create policy "recursos_update_operador_zona"
on public.recursos for update
using (
  public.rol_actual() = 'operador'
  and (
    public.ciudad_asignada_actual() is null
    or public.ciudad_asignada_actual() = ciudad
  )
);

-- ---------------------------------------------------------
-- DESPACHOS: solo operadores/admin, filtrados por zona vía la emergencia asociada
-- ---------------------------------------------------------
create policy "despachos_select_staff"
on public.despachos for select
using (
  public.rol_actual() = 'admin'
  or (
    public.rol_actual() = 'operador'
    and exists (
      select 1 from public.emergencias e
      where e.id = despachos.emergencia_id
        and (
          public.ciudad_asignada_actual() is null
          or public.ciudad_asignada_actual() = e.ciudad
        )
    )
  )
);

create policy "despachos_insert_staff"
on public.despachos for insert
with check (public.rol_actual() in ('operador', 'admin'));

create policy "despachos_update_staff"
on public.despachos for update
using (public.rol_actual() in ('operador', 'admin'));

-- ---------------------------------------------------------
-- NOTIFICACIONES: el ciudadano ve solo las de sus propias emergencias;
-- el staff ve todas dentro de su zona.
-- ---------------------------------------------------------
create policy "notificaciones_select_propias_o_staff"
on public.notificaciones for select
using (
  exists (
    select 1 from public.emergencias e
    where e.id = notificaciones.emergencia_id
      and (
        e.creado_por = auth.uid()
        or public.rol_actual() = 'admin'
        or (
          public.rol_actual() = 'operador'
          and (
            public.ciudad_asignada_actual() is null
            or public.ciudad_asignada_actual() = e.ciudad
          )
        )
      )
  )
);

create policy "notificaciones_insert_service"
on public.notificaciones for insert
with check (public.rol_actual() in ('operador', 'admin'));
