/**
 * Códigos de error que puede lanzar la función `asignar_despacho` en
 * Postgres (ver migración 004_dispatch_function.sql), traducidos a algo
 * que el handler pueda convertir en respuestas HTTP con sentido.
 */
export const ERRORES_ASIGNACION = {
  P0001: { status: 404, mensaje: "La emergencia no existe" },
  P0002: { status: 409, mensaje: "La emergencia ya fue despachada previamente" },
  P0003: { status: 409, mensaje: "No hay recursos disponibles en esta ciudad ahora mismo" },
};

/**
 * Ejecuta la asignación atómica vía RPC. Toda la lógica de "encontrar el
 * más cercano + marcarlo ocupado + crear el despacho" vive en la base de
 * datos (ver migración) para garantizar atomicidad real bajo concurrencia
 * — no se puede lograr lo mismo con múltiples llamadas separadas desde
 * el microservicio sin arriesgar condiciones de carrera.
 */
export async function asignarDespacho(supabase, emergenciaId, operadorId = null) {
  const { data, error } = await supabase.rpc("asignar_despacho", {
    p_emergencia_id: emergenciaId,
    p_operador_id: operadorId,
  });

  if (error) {
    const info = ERRORES_ASIGNACION[error.code];
    if (info) {
      const err = new Error(info.mensaje);
      err.status = info.status;
      err.code = error.code;
      throw err;
    }
    // Error no anticipado -> lo dejamos subir tal cual para loguearlo completo.
    throw error;
  }

  return data;
}
