const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ESTADOS_DESPACHO_VALIDOS = [
  "asignado",
  "en_camino",
  "en_sitio",
  "completado",
  "cancelado",
];

export function validarCreacionDespacho(body) {
  const errores = [];

  if (!body || typeof body !== "object") {
    return { valido: false, errores: ["El body debe ser un objeto JSON"] };
  }

  if (typeof body.emergencia_id !== "string" || !UUID_REGEX.test(body.emergencia_id)) {
    errores.push('"emergencia_id" debe ser un UUID válido');
  }

  if (body.operador_id !== undefined && body.operador_id !== null) {
    if (typeof body.operador_id !== "string" || !UUID_REGEX.test(body.operador_id)) {
      errores.push('"operador_id" debe ser un UUID válido si se envía');
    }
  }

  return { valido: errores.length === 0, errores };
}

export function validarActualizacionDespacho(id, body) {
  const errores = [];

  if (typeof id !== "string" || !UUID_REGEX.test(id)) {
    errores.push('El "id" del despacho en la URL debe ser un UUID válido');
  }

  if (!body || typeof body !== "object") {
    errores.push("El body debe ser un objeto JSON");
  } else if (!ESTADOS_DESPACHO_VALIDOS.includes(body.estado)) {
    errores.push(`"estado" debe ser uno de: ${ESTADOS_DESPACHO_VALIDOS.join(", ")}`);
  }

  return { valido: errores.length === 0, errores };
}
