/**
 * Cálculo DETERMINÍSTICO de prioridad de triage.
 *
 * Regla base: cada tipo de solicitud tiene una prioridad por defecto
 * (según la tabla del enunciado). Sobre esa base aplicamos reglas de
 * escalamiento fijas según los datos reportados — nada de aleatoriedad
 * ni de modelos probabilísticos: mismas entradas -> misma salida, siempre.
 */

const PRIORIDAD_BASE = {
  usar_medica: "P1",
  albergue: "P2",
  suministros: "P3",
  danos_estructurales: "P4",
};

const ORDEN_PRIORIDAD = ["P1", "P2", "P3", "P4"]; // P1 = más crítico

function escalar(prioridadActual, prioridadPropuesta) {
  const idxActual = ORDEN_PRIORIDAD.indexOf(prioridadActual);
  const idxPropuesta = ORDEN_PRIORIDAD.indexOf(prioridadPropuesta);
  // Nos quedamos con la más crítica (índice más bajo)
  return idxPropuesta < idxActual ? prioridadPropuesta : prioridadActual;
}

export function calcularPrioridad(tipo, datos = {}) {
  let prioridad = PRIORIDAD_BASE[tipo];
  if (!prioridad) {
    throw new Error(`Tipo de emergencia desconocido: ${tipo}`);
  }

  switch (tipo) {
    case "usar_medica": {
      // Ya es P1 (máxima criticidad), no hay escalamiento posible.
      break;
    }

    case "albergue": {
      // Escala a P1 si hay riesgo inminente para la vida (ej. vivienda
      // colapsando con personas dentro) reportado explícitamente.
      if (datos.riesgo_vital === true) {
        prioridad = escalar(prioridad, "P1");
      }
      // Escala a P1 si hay menores o adultos mayores en condición de
      // vivienda no habitable (grupo vulnerable + sin techo).
      else if (
        datos.vivienda_habitable === false &&
        ((datos.ninos ?? 0) > 0 || (datos.tercera_edad ?? 0) > 0)
      ) {
        prioridad = escalar(prioridad, "P1");
      }
      break;
    }

    case "suministros": {
      // Medicamentos crónicos se trata como más urgente que otros insumos.
      if (datos.categoria === "medicamentos_cronicos") {
        prioridad = escalar(prioridad, "P2");
      }
      break;
    }

    case "danos_estructurales": {
      // Riesgo de colapso sobre vía pública transitada => sube a P2.
      if (datos.riesgo_colapso_via === true) {
        prioridad = escalar(prioridad, "P2");
      }
      // Agrietamiento severo en edificación residencial ocupada => P2.
      if (
        datos.nivel_agrietamiento === "severo" &&
        datos.tipo_edificacion === "residencial"
      ) {
        prioridad = escalar(prioridad, "P2");
      }
      break;
    }
  }

  return prioridad;
}
