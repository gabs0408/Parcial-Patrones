import { randomUUID } from "node:crypto";
import { getSupabaseClient } from "./supabaseClient.mjs";
import { validarPayload } from "./validation.mjs";
import { calcularPrioridad } from "./triage.mjs";

function respuesta(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function log(nivel, mensaje, extra = {}) {
  // Log estructurado en JSON -> CloudWatch lo indexa mejor que texto plano.
  console.log(JSON.stringify({ nivel, mensaje, ...extra, ts: new Date().toISOString() }));
}

/**
 * POST /v1/emergencias
 * Recibe un reporte ciudadano, lo valida, calcula la prioridad de triage
 * de forma determinística, y lo persiste en Supabase.
 */
export const handler = async (event) => {
  const requestId = event.requestContext?.requestId || randomUUID();

  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    log("warn", "Body no es JSON válido", { requestId });
    return respuesta(400, { error: "El body debe ser JSON válido" });
  }

  const { valido, errores } = validarPayload(body);
  if (!valido) {
    log("warn", "Payload inválido", { requestId, errores });
    return respuesta(400, { error: "Payload inválido", detalles: errores });
  }

  const prioridad = calcularPrioridad(body.tipo, body.datos ?? {});
  const idempotencyKey = body.idempotency_key || requestId;

  try {
    const supabase = await getSupabaseClient();

    // Idempotencia: si ya existe una emergencia con esta key, la devolvemos
    // tal cual en vez de crear un duplicado (crítico bajo picos de tráfico).
    const { data: existente } = await supabase
      .from("emergencias")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existente) {
      log("info", "Emergencia idempotente ya existía", { requestId, id: existente.id });
      return respuesta(200, existente);
    }

    const { data, error } = await supabase
      .from("emergencias")
      .insert({
        tipo: body.tipo,
        prioridad,
        ciudad: body.ciudad,
        ubicacion: `POINT(${body.ubicacion.lng} ${body.ubicacion.lat})`,
        descripcion: body.descripcion ?? null,
        datos: body.datos ?? {},
        creado_por: body.creado_por ?? null,
        idempotency_key: idempotencyKey,
      })
      .select()
      .single();

    if (error) {
      log("error", "Error insertando en Supabase", { requestId, error: error.message });
      return respuesta(502, { error: "No se pudo registrar la emergencia" });
    }

    log("info", "Emergencia creada", { requestId, id: data.id, prioridad, tipo: body.tipo });
    return respuesta(201, data);
  } catch (err) {
    log("error", "Error inesperado", { requestId, error: err.message });
    return respuesta(500, { error: "Error interno del servidor" });
  }
};
