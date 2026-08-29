const TIPOS_VALIDOS = ["usar_medica", "albergue", "suministros", "danos_estructurales"];
const CIUDADES_VALIDAS = ["choco", "pereira", "cali", "manizales"];

/**
 * Valida la integridad del payload recibido. Devuelve { valido, errores }.
 * Se mantiene simple y sin dependencias para minimizar el tamaño de la imagen;
 * si el equipo crece el esquema, considerar migrar a ajv con schemas JSON.
 */
export function validarPayload(body) {
  const errores = [];

  if (!body || typeof body !== "object") {
    return { valido: false, errores: ["El body debe ser un objeto JSON"] };
  }

  if (!TIPOS_VALIDOS.includes(body.tipo)) {
    errores.push(`"tipo" debe ser uno de: ${TIPOS_VALIDOS.join(", ")}`);
  }

  if (!CIUDADES_VALIDAS.includes(body.ciudad)) {
    errores.push(`"ciudad" debe ser una de: ${CIUDADES_VALIDAS.join(", ")}`);
  }

  const lat = body?.ubicacion?.lat;
  const lng = body?.ubicacion?.lng;
  if (typeof lat !== "number" || lat < -90 || lat > 90) {
    errores.push('"ubicacion.lat" debe ser un número entre -90 y 90');
  }
  if (typeof lng !== "number" || lng < -180 || lng > 180) {
    errores.push('"ubicacion.lng" debe ser un número entre -180 y 180');
  }

  if (body.creado_por && typeof body.creado_por !== "string") {
    errores.push('"creado_por" debe ser un UUID (string)');
  }

  if (body.datos !== undefined && typeof body.datos !== "object") {
    errores.push('"datos" debe ser un objeto');
  }

  return { valido: errores.length === 0, errores };
}
