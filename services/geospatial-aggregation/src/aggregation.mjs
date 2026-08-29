/**
 * Tamaño de grilla por defecto para el clustering (~1.1 km en Colombia).
 * Se puede ajustar por query param si se necesita más/menos granularidad.
 */
const TAMANO_GRID_DEFAULT = 0.01;
const RADIO_AISLAMIENTO_METROS_DEFAULT = 5000;

/**
 * Devuelve los clusters de emergencias activas (puntos calientes) y las
 * zonas aisladas (sin recursos cercanos disponibles) para una ciudad.
 * Ambas consultas corren como funciones SQL en Postgres (ver migración
 * 005) para aprovechar los índices espaciales de PostGIS — traer todas
 * las filas a Node y agrupar en memoria sería mucho más lento y no
 * escalaría con el volumen de reportes durante un pico de tráfico real.
 */
export async function obtenerAgregacionZona(supabase, ciudad, opciones = {}) {
  const tamanoGrid = opciones.tamanoGrid ?? TAMANO_GRID_DEFAULT;
  const radioAislamiento = opciones.radioAislamiento ?? RADIO_AISLAMIENTO_METROS_DEFAULT;

  const [clustersResp, aisladasResp] = await Promise.all([
    supabase.rpc("agrupar_emergencias_por_zona", {
      p_ciudad: ciudad,
      p_tamano_grid: tamanoGrid,
    }),
    supabase.rpc("detectar_zonas_aisladas", {
      p_ciudad: ciudad,
      p_radio_metros: radioAislamiento,
    }),
  ]);

  if (clustersResp.error) throw clustersResp.error;
  if (aisladasResp.error) throw aisladasResp.error;

  return {
    ciudad,
    clusters: clustersResp.data,
    zonas_aisladas: aisladasResp.data,
    parametros: { tamano_grid: tamanoGrid, radio_aislamiento_metros: radioAislamiento },
  };
}
