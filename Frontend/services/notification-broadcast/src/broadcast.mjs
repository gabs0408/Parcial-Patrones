const TIMEOUT_MS = 5000;

/**
 * Envía un POST a una URL de webhook con un timeout controlado
 * (AbortController), para que un endpoint externo lento o caído no
 * cuelgue la Lambda. Nunca lanza excepción hacia arriba: siempre
 * devuelve un resultado { exito, statusCode?, error? } para que el
 * llamador decida qué hacer (registrar éxito o fallo).
 */
async function enviarWebhook(url, payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return { exito: resp.ok, statusCode: resp.status };
  } catch (err) {
    clearTimeout(timeoutId);
    return { exito: false, error: err.name === "AbortError" ? "timeout" : err.message };
  }
}

/**
 * Transmite el estado actual de una emergencia a una lista de webhooks
 * (organismos de socorro, sistemas externos, etc.) y deja un registro
 * en `notificaciones` de CADA intento, exitoso o no — así queda
 * trazabilidad completa de qué se notificó, cuándo, y si llegó.
 *
 * Si no se pasan `webhookUrls`, igual se registra una notificación con
 * canal 'realtime' — Supabase Realtime ya transmite el cambio de fila a
 * cualquier cliente suscrito (el dashboard de operadores), así que este
 * caso solo deja evidencia de que el evento ocurrió, sin llamada externa.
 */
export async function difundirActualizacion(supabase, emergenciaId, { webhookUrls = [], evento = "actualizacion_estado" } = {}) {
  const { data: emergencia, error: errBusqueda } = await supabase
    .from("emergencias")
    .select("*")
    .eq("id", emergenciaId)
    .maybeSingle();

  if (errBusqueda) throw errBusqueda;
  if (!emergencia) {
    const err = new Error("La emergencia no existe");
    err.status = 404;
    throw err;
  }

  const payloadNotificacion = {
    evento,
    emergencia_id: emergencia.id,
    tipo: emergencia.tipo,
    prioridad: emergencia.prioridad,
    ciudad: emergencia.ciudad,
    estado: emergencia.estado,
    actualizado_at: emergencia.actualizado_at,
  };

  const resultados = [];

  if (webhookUrls.length === 0) {
    // Sin destinatarios externos: solo dejamos constancia del evento.
    const { error } = await supabase.from("notificaciones").insert({
      emergencia_id: emergenciaId,
      canal: "realtime",
      payload: payloadNotificacion,
    });
    if (error) throw error;
    resultados.push({ canal: "realtime", exito: true });
    return { emergencia_id: emergenciaId, resultados };
  }

  // Envía a todos los webhooks en paralelo (no uno tras otro) para no
  // multiplicar la latencia total por el número de destinatarios.
  const envios = await Promise.all(
    webhookUrls.map(async (url) => {
      const resultado = await enviarWebhook(url, payloadNotificacion);
      return { url, ...resultado };
    })
  );

  // Registra cada intento (éxito o fallo) como una fila independiente.
  const filas = envios.map((r) => ({
    emergencia_id: emergenciaId,
    canal: "webhook",
    payload: { ...payloadNotificacion, destino: r.url, exito: r.exito, statusCode: r.statusCode ?? null, error: r.error ?? null },
  }));

  const { error: errInsert } = await supabase.from("notificaciones").insert(filas);
  if (errInsert) throw errInsert;

  resultados.push(...envios.map((r) => ({ canal: "webhook", url: r.url, exito: r.exito, statusCode: r.statusCode, error: r.error })));

  return { emergencia_id: emergenciaId, resultados };
}
