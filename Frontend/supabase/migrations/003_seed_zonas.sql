-- =========================================================
-- Migración 003: Seed de las 4 zonas/nodos geográficos
-- Coordenadas aproximadas del centro urbano de cada ciudad
-- =========================================================

insert into public.zonas (ciudad, centro, radio_cobertura_km) values
  ('choco',     st_setsrid(st_makepoint(-76.6413, 5.6947), 4326)::geography, 40),
  ('pereira',   st_setsrid(st_makepoint(-75.6961, 4.8087), 4326)::geography, 30),
  ('cali',      st_setsrid(st_makepoint(-76.5320, 3.4516), 4326)::geography, 35),
  ('manizales', st_setsrid(st_makepoint(-75.5138, 5.0703), 4326)::geography, 30);
