import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { actualizarEstadoDespacho, despacharCuadrilla, getZonasYClusters } from '../lib/api';
import { MapView } from './MapContainer';

const etiquetasDetalles = {
  personasAtrapadasHeridas: 'Personas atrapadas o heridas',
  riesgoInminente: 'Riesgo inminente',
  adultos: 'Adultos damnificados',
  ninos: 'Niños damnificados',
  terceraEdad: 'Personas de tercera edad',
  accesibilidad: 'Accesibilidad requerida',
  habitabilidad: 'Habitabilidad de la vivienda',
  categoriaInsumo: 'Categoría de insumo',
  tipoEdificacion: 'Tipo de edificación',
  nivelDanos: 'Nivel de daños',
  riesgoColapsoVias: 'Riesgo de colapso sobre vías',
};

const obtenerUbicacion = (item) => {
  const ubicacion = item.ubicacion || item.location || item.coordenadas;
  const lat = ubicacion?.lat ?? ubicacion?.latitude ?? item.lat ?? item.latitud ?? item.centro_lat;
  const lng = ubicacion?.lng ?? ubicacion?.longitude ?? item.lng ?? item.longitud ?? item.centro_lng;
  const latitud = Number(lat);
  const longitud = Number(lng);
  return Number.isFinite(latitud) && Number.isFinite(longitud)
    ? { lat: latitud, lng: longitud }
    : null;
};

const obtenerReportesLocales = () => {
  try {
    return JSON.parse(localStorage.getItem('reportes-emergencias') || '[]');
  } catch {
    return [];
  }
};

const camposPorTipo = {
  usar_medica: ['personasAtrapadasHeridas', 'riesgoInminente'],
  albergue: ['adultos', 'ninos', 'terceraEdad', 'accesibilidad', 'habitabilidad'],
  suministros: ['categoriaInsumo'],
  danos_estructurales: ['tipoEdificacion', 'nivelDanos', 'riesgoColapsoVias', 'evidenciaFotografica'],
};

const filtrarDatosPorTipo = (datos, tipo) => {
  const campos = camposPorTipo[tipo] || [];
  const datosFiltrados = {};
  campos.forEach((campo) => {
    if (campo in datos) {
      datosFiltrados[campo] = datos[campo];
    }
  });
  return datosFiltrados;
};

export function OperatorPanel({ ciudadSeleccionada, onCiudadChange, isMapsLoaded }) {
  const [emergencias, setEmergencias] = useState([]);
  const [marcadores, setMarcadores] = useState([]);
  const [seleccionada, setSeleccionada] = useState(null);
  const [despacho, setDespacho] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const cargarEmergencias = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const datos = await getZonasYClusters(ciudadSeleccionada);
      const reportesLocales = obtenerReportesLocales();
      const zonasActivas = (datos.zonas_aisladas || []).map((item) => {
        const reporteLocal = reportesLocales.find((reporte) => reporte.id === item.id);
        return {
          ...item,
          direccion: item.direccion || reporteLocal?.direccion,
          ubicacion: obtenerUbicacion(item) || reporteLocal?.ubicacion,
          datos_criticos: item.datos_criticos || reporteLocal?.datos_criticos,
          evidenciaFotografica: item.evidenciaFotografica || reporteLocal?.evidenciaFotografica,
        };
      }).filter((item) => (
        localStorage.getItem(`emergencia-estado-${item.id}`) !== 'completado'
      ));
      const zonasConUbicacion = zonasActivas.map((item) => ({
        ...item,
        ubicacion: obtenerUbicacion(item) || item.ubicacion,
      }));
      setEmergencias(zonasConUbicacion);
      const marcadoresIndividuales = zonasConUbicacion
        .map((item) => ({ item, ubicacion: obtenerUbicacion(item) }))
        .filter(({ ubicacion }) => ubicacion)
        .map((item) => ({
          id: item.item.id,
          tipo: item.item.tipo,
          prioridad: item.item.prioridad,
          direccion: item.item.direccion,
          descripcion: item.item.descripcion,
          ubicacion: item.ubicacion,
        }));
      setMarcadores(marcadoresIndividuales);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [ciudadSeleccionada]);

  useEffect(() => {
    cargarEmergencias();
  }, [cargarEmergencias]);

  const asignarYActualizar = async (estado) => {
    if (!seleccionada) return;
    const emergenciaId = seleccionada.id;
    setError('');

    setDespacho((actual) => ({ ...(actual || {}), estado }));
    localStorage.setItem(`emergencia-estado-${emergenciaId}`, estado);
    if (estado === 'completado') {
      const peticionesRestantes = emergencias.filter((item) => item.id !== emergenciaId);
      setEmergencias(peticionesRestantes);
      setMarcadores((actuales) => {
        if (peticionesRestantes.length === 0) return [];
        if (actuales.some((item) => item.id === emergenciaId)) {
          return actuales.filter((item) => item.id !== emergenciaId);
        }
        return actuales;
      });
      setSeleccionada(null);
    }

    try {
      let despachoActual = despacho;
      if (!despachoActual) despachoActual = await despacharCuadrilla(emergenciaId);
      if (estado) despachoActual = await actualizarEstadoDespacho(despachoActual.id, estado);
      setDespacho(despachoActual);
      if (estado !== 'completado') await cargarEmergencias();
    } catch (err) {
      setError(err.message);
    }
  };

  const evidenciaSeleccionada = seleccionada && (() => {
    let evidenciaLocal = null;
    try {
      const ultimoReporte = JSON.parse(localStorage.getItem('ultimo-reporte'));
      evidenciaLocal = ultimoReporte?.id === seleccionada.id ? ultimoReporte.evidenciaFotografica : null;
    } catch {
      evidenciaLocal = null;
    }

    return [
      seleccionada.evidenciaFotografica,
      seleccionada.evidencia_fotografica,
      seleccionada.datos_criticos?.evidenciaFotografica,
      evidenciaLocal,
    ].find((valor) => typeof valor === 'string' && (valor.startsWith('data:image') || valor.startsWith('http')));
  })();
  const mostrarError = error && !error.toLowerCase().includes('no hay recursos disponibles');
  const datosSeleccionados = seleccionada 
    ? filtrarDatosPorTipo(seleccionada?.datos_criticos || seleccionada?.datosCriticos || {}, seleccionada.tipo)
    : {};

  return (
    <section className="operator-panel">
      <h2>Panel de Operador</h2>
      <div className="dashboard-controls">
      <label htmlFor="operador-ciudad">Filtrar por ciudad:
      <select id="operador-ciudad" value={ciudadSeleccionada} onChange={(event) => onCiudadChange(event.target.value)}>
        <option value="choco">Chocó</option>
        <option value="pereira">Pereira</option>
        <option value="cali">Cali</option>
        <option value="manizales">Manizales</option>
      </select></label>
      <button className="btn-secondary" type="button" onClick={cargarEmergencias} disabled={cargando}>Actualizar</button>
      </div>
      {mostrarError && <p role="alert">{error}</p>}
      <div className="operator-dashboard">
        <div className="reports-panel">
          <h3>Reportes pendientes</h3>
          {emergencias.length === 0 && <p>No hay reportes aislados para esta ciudad.</p>}
          <div className="emergency-list">
            {emergencias.map((item) => {
              const prioridad = String(item.prioridad || 'P1').toUpperCase();
              const evidencia = item.evidenciaFotografica
                || item.evidencia_fotografica
                || item.datos_criticos?.evidenciaFotografica
                || (() => {
                  try {
                    const ultimoReporte = JSON.parse(localStorage.getItem('ultimo-reporte'));
                    return ultimoReporte?.id === item.id ? ultimoReporte.evidenciaFotografica : null;
                  } catch {
                    return null;
                  }
                })();
              const seleccionar = () => { setSeleccionada(item); setDespacho(null); };

              return (
                <div
                  key={item.id}
                  className={`emergency-card ${prioridad.toLowerCase()}`}
                  role="button"
                  tabIndex="0"
                  aria-pressed={seleccionada?.id === item.id}
                  onClick={seleccionar}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') seleccionar();
                  }}
                >
                  <div className="card-header">
                    <span className="priority-badge">{prioridad}</span>
                    <span className="card-type">{item.tipo}</span>
                  </div>
                  <p className="card-description">{item.descripcion}</p>
                  {evidencia?.startsWith?.('data:image') && <img className="card-evidence" src={evidencia} alt="Evidencia de la petición" />}
                </div>
              );
            })}
          </div>
          {seleccionada && (
            <div className="modal-overlay" onClick={() => setSeleccionada(null)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h4>Detalle completo de la petición</h4>
                  <button className="modal-close" onClick={() => setSeleccionada(null)}>✕</button>
                </div>
                <div className="modal-body">
                  <div className="report-summary">
                    <p><strong>ID</strong><span>{seleccionada.id}</span></p>
                    <p><strong>Tipo</strong><span>{seleccionada.tipo || 'No especificado'}</span></p>
                    <p><strong>Prioridad</strong><span>{seleccionada.prioridad || 'No especificada'}</span></p>
                    <p><strong>Ciudad</strong><span>{seleccionada.ciudad || ciudadSeleccionada}</span></p>
                    <p><strong>Dirección</strong><span>{seleccionada.direccion || 'No disponible en este reporte'}</span></p>
                    {seleccionada.ubicacion && <p><strong>Coordenadas GPS</strong><span>{seleccionada.ubicacion.lat}, {seleccionada.ubicacion.lng}</span></p>}
                    <p><strong>Descripción</strong><span>{seleccionada.descripcion || 'Sin descripción'}</span></p>
                  </div>
                  {Object.keys(datosSeleccionados).length > 0 && <div className="critical-details">
                    <h5>Datos diligenciados en el formulario</h5>
                    {Object.entries(datosSeleccionados).map(([clave, valor]) => (
                      <p key={clave}>
                        <strong>{etiquetasDetalles[clave] || clave}</strong>
                        <span>{typeof valor === 'object' ? JSON.stringify(valor) : String(valor || 'No especificado')}</span>
                      </p>
                    ))}
                  </div>}
                  {seleccionada.tipo === 'danos_estructurales' && evidenciaSeleccionada?.startsWith?.('data:image') && <img className="evidence-preview" src={evidenciaSeleccionada} alt="Evidencia del reporte seleccionado" />}
                </div>
                <div className="modal-footer">
                  <button className="btn-action" type="button" onClick={() => asignarYActualizar('en_camino')}>Marcar en camino</button>{' '}
                  <button className="btn-action" type="button" onClick={() => asignarYActualizar('completado')}>Ayuda recibida</button>
                  {despacho && <p className="despacho-status">Estado del despacho: {despacho.estado}</p>}
                </div>
              </div>
            </div>
          )}
        </div>
        {isMapsLoaded && <MapView ciudadSeleccionada={ciudadSeleccionada} emergencias={marcadores} />}
      </div>
    </section>
  );
}

OperatorPanel.propTypes = {
  ciudadSeleccionada: PropTypes.string.isRequired,
  onCiudadChange: PropTypes.func.isRequired,
  isMapsLoaded: PropTypes.bool.isRequired,
};
