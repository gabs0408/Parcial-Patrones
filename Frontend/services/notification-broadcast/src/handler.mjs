import { randomUUID } from "node:crypto";
import { getSupabaseClient } from "./supabaseClient.mjs";
import { validarPayload } from "./validation.mjs";
import { difundirActualizacion } from "./broadcast.mjs";

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
 * POST /v1/notificaciones
 * Body: { emergencia_id, webhook_urls?, evento? }
 *
 * Pensado para ser invocado por los otros microservicios (ej. Dispatch,
 * después de asignar un despacho) o directamente vía API Gateway cuando
 * un operador quiera forzar un reenvío de notificación a los organismos.
 */
export const handler = async (event) => {
  const requestId = event.requestContext?.requestId || randomUUID();

  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return respuesta(400, { error: "El body debe ser JSON válido" });
  }

  const { valido, errores } = validarPayload(body);
  if (!valido) {
    log("warn", "Payload inválido", { requestId, errores });
    return respuesta(400, { error: "Payload inválido", detalles: errores });
  }

  try {
    const supabase = await getSupabaseClient();
    const resultado = await difundirActualizacion(supabase, body.emergencia_id, {
      webhookUrls: body.webhook_urls ?? [],
      evento: body.evento,
    });

    const fallidos = resultado.resultados.filter((r) => !r.exito).length;
    log("info", "Notificaciones procesadas", {
      requestId,
      emergenciaId: body.emergencia_id,
      totalEnviadas: resultado.resultados.length,
      fallidos,
    });

    return respuesta(200, resultado);
  } catch (err) {
    if (err.status) {
      log("warn", "Notificación rechazada", { requestId, mensaje: err.message });
      return respuesta(err.status, { error: err.message });
    }
    log("error", "Error inesperado enviando notificaciones", { requestId, error: err.message });
    return respuesta(500, { error: "Error interno del servidor" });
  }
};
