import { randomUUID } from "node:crypto";
import { getSupabaseClient } from "./supabaseClient.mjs";
import { validarCiudad } from "./validation.mjs";
import { obtenerAgregacionZona } from "./aggregation.mjs";

function respuesta(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function log(nivel, mensaje, extra = {}) {
  console.log(JSON.stringify({ nivel, mensaje, ...extra, ts: new Date().toISOString() }));
}

/**
 * GET /v1/emergencias/zona/{ciudad}
 * Query params opcionales:
 *   - tamano_grid: tamaño de celda para el clustering (grados decimales)
 *   - radio_aislamiento: radio en metros para detectar zonas aisladas
 */
export const handler = async (event) => {
  const requestId = event.requestContext?.requestId || randomUUID();

  const ciudad = event.pathParameters?.ciudad;
  const { valido, errores } = validarCiudad(ciudad);
  if (!valido) {
    log("warn", "Ciudad inválida", { requestId, errores });
    return respuesta(400, { error: "Parámetro inválido", detalles: errores });
  }

  const qs = event.queryStringParameters || {};
  const opciones = {};
  if (qs.tamano_grid) opciones.tamanoGrid = Number(qs.tamano_grid);
  if (qs.radio_aislamiento) opciones.radioAislamiento = Number(qs.radio_aislamiento);

  try {
    const supabase = await getSupabaseClient();
    const resultado = await obtenerAgregacionZona(supabase, ciudad, opciones);

    log("info", "Agregación calculada", {
      requestId,
      ciudad,
      totalClusters: resultado.clusters.length,
      totalAisladas: resultado.zonas_aisladas.length,
    });

    return respuesta(200, resultado);
  } catch (err) {
    log("error", "Error calculando agregación", { requestId, error: err.message });
    return respuesta(500, { error: "Error interno del servidor" });
  }
};
