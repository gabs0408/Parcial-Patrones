const CIUDADES_VALIDAS = ["choco", "pereira", "cali", "manizales"];

export function validarCiudad(ciudad) {
  if (!CIUDADES_VALIDAS.includes(ciudad)) {
    return {
      valido: false,
      errores: [`"ciudad" debe ser una de: ${CIUDADES_VALIDAS.join(", ")}`],
    };
  }
  return { valido: true, errores: [] };
}
