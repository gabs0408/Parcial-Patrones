import { randomUUID } from "node:crypto";
import { getSupabaseClient } from "./supabaseClient.mjs";
import { validarCreacionDespacho, validarActualizacionDespacho } from "./validation.mjs";
import { asignarDespacho } from "./assignment.mjs";

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
 * POST /v1/despachos
 * Body: { emergencia_id, operador_id? }
 * Asigna atómicamente el recurso disponible más cercano.
 */
async function crearDespacho(body, requestId) {
  const { valido, errores } = validarCreacionDespacho(body);
  if (!valido) {
    log("warn", "Payload inválido en creación de despacho", { requestId, errores });
    return respuesta(400, { error: "Payload inválido", detalles: errores });
  }

  const supabase = await getSupabaseClient();

  try {
    const despacho = await asignarDespacho(supabase, body.emergencia_id, body.operador_id ?? null);
    log("info", "Despacho creado", { requestId, despachoId: despacho.id, recursoId: despacho.recurso_id });
    return respuesta(201, despacho);
  } catch (err) {
    if (err.status) {
      log("warn", "Asignación rechazada", { requestId, code: err.code, mensaje: err.message });
      return respuesta(err.status, { error: err.message });
    }
    log("error", "Error inesperado asignando despacho", { requestId, error: err.message });
    return respuesta(500, { error: "Error interno del servidor" });
  }
}

/**
 * PATCH /v1/despachos/{id}
 * Body: { estado }
 * Actualiza el estado de un despacho existente (en_camino, en_sitio, etc.).
 * Si el nuevo estado es "completado" o "cancelado", libera el recurso
 * (lo vuelve a marcar como disponible) para que pueda asignarse de nuevo.
 */
async function actualizarEstadoDespacho(id, body, requestId) {
  const { valido, errores } = validarActualizacionDespacho(id, body);
  if (!valido) {
    log("warn", "Payload inválido en actualización de despacho", { requestId, errores });
    return respuesta(400, { error: "Payload inválido", detalles: errores });
  }

  const supabase = await getSupabaseClient();

  const { data: despacho, error: errBusqueda } = await supabase
    .from("despachos")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (errBusqueda) {
    log("error", "Error consultando despacho", { requestId, error: errBusqueda.message });
    return respuesta(500, { error: "Error interno del servidor" });
  }
  if (!despacho) {
    return respuesta(404, { error: "Despacho no encontrado" });
  }

  const { data: actualizado, error: errUpdate } = await supabase
    .from("despachos")
    .update({ estado: body.estado })
    .eq("id", id)
    .select()
    .single();

  if (errUpdate) {
    log("error", "Error actualizando despacho", { requestId, error: errUpdate.message });
    return respuesta(500, { error: "Error interno del servidor" });
  }

  // Libera el recurso si el despacho terminó o se canceló.
  if (["completado", "cancelado"].includes(body.estado)) {
    const { error: errRecurso } = await supabase
      .from("recursos")
      .update({ disponible: true })
      .eq("id", despacho.recurso_id);

    if (errRecurso) {
      log("error", "No se pudo liberar el recurso", { requestId, error: errRecurso.message });
      // No fallamos la respuesta por esto; el despacho sí quedó actualizado.
      // Se deja registrado en logs para revisión manual/alarma.
    } else {
      log("info", "Recurso liberado", { requestId, recursoId: despacho.recurso_id });
    }
  }

  log("info", "Despacho actualizado", { requestId, despachoId: id, nuevoEstado: body.estado });
  return respuesta(200, actualizado);
}

export const handler = async (event) => {
  const requestId = event.requestContext?.requestId || randomUUID();

  let body = {};
  if (event.body) {
    try {
      body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch {
      return respuesta(400, { error: "El body debe ser JSON válido" });
    }
  }

  const method = event.requestContext?.http?.method || event.httpMethod;
  const despachoId = event.pathParameters?.id;

  try {
    if (method === "POST") {
      return await crearDespacho(body, requestId);
    }
    if (method === "PATCH" && despachoId) {
      return await actualizarEstadoDespacho(despachoId, body, requestId);
    }
    return respuesta(405, { error: "Método no soportado" });
  } catch (err) {
    log("error", "Error inesperado en el handler", { requestId, error: err.message });
    return respuesta(500, { error: "Error interno del servidor" });
  }
};
