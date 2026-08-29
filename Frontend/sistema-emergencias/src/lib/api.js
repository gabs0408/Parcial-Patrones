const API_BASE_URL = 'https://1l3ti5luw8.execute-api.us-east-1.amazonaws.com/prod';

// POST /v1/emergencias (Ciudadano)
export async function crearEmergencia(datosFormulario) {
  const res = await fetch(`${API_BASE_URL}/v1/emergencias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...datosFormulario,
      idempotency_key: crypto.randomUUID(), // Genera clave única por envío
    }),
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || data.error || `Error del servidor (${res.status})`);
  }

  return data;
}

// GET /v1/emergencias/zona/{ciudad} (Operador)
export async function getZonasYClusters(ciudad) {
  const res = await fetch(`${API_BASE_URL}/v1/emergencias/zona/${ciudad}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Error del servidor (${res.status})`);
  return data;
}

export async function buscarEmergencia(ciudad, emergenciaId) {
  const datos = await getZonasYClusters(ciudad);
  return [...(datos.zonas_aisladas || [])].find((item) => item.id === emergenciaId) || null;
}

// POST /v1/despachos (Operador)
export async function despacharCuadrilla(emergenciaId, operadorId = null) {
  const res = await fetch(`${API_BASE_URL}/v1/despachos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emergencia_id: emergenciaId, operador_id: operadorId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Error del servidor (${res.status})`);
  return data;
}

// PATCH /v1/despachos/{id} (Operador)
export async function actualizarEstadoDespacho(despachoId, nuevoEstado) {
  const res = await fetch(`${API_BASE_URL}/v1/despachos/${despachoId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado: nuevoEstado }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Error del servidor (${res.status})`);
  return data;
}