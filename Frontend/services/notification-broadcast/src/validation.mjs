const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esUrlValida(str) {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function validarPayload(body) {
  const errores = [];

  if (!body || typeof body !== "object") {
    return { valido: false, errores: ["El body debe ser un objeto JSON"] };
  }

  if (typeof body.emergencia_id !== "string" || !UUID_REGEX.test(body.emergencia_id)) {
    errores.push('"emergencia_id" debe ser un UUID válido');
  }

  if (body.webhook_urls !== undefined) {
    if (!Array.isArray(body.webhook_urls) || body.webhook_urls.length === 0) {
      errores.push('"webhook_urls", si se envía, debe ser un arreglo no vacío');
    } else if (!body.webhook_urls.every(esUrlValida)) {
      errores.push('Todas las "webhook_urls" deben ser URLs http/https válidas');
    }
  }

  if (body.evento !== undefined && typeof body.evento !== "string") {
    errores.push('"evento" debe ser un string si se envía');
  }

  return { valido: errores.length === 0, errores };
}
