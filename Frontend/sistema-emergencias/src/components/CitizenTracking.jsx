import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { buscarEmergencia } from '../lib/api';

export function CitizenTracking({ reportes }) {
  const [emergencias, setEmergencias] = useState(reportes);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setEmergencias(reportes);
  }, [reportes]);

  // Leer y actualizar el estado desde localStorage
  useEffect(() => {
    const actualizarEstados = () => {
      setEmergencias((actuales) => actuales.map((reporte) => {
        const estadoGuardado = localStorage.getItem(`emergencia-estado-${reporte.id}`);
        return estadoGuardado ? { ...reporte, estado: estadoGuardado } : reporte;
      }));
    };

    actualizarEstados();
    const intervalo = window.setInterval(actualizarEstados, 1000);
    window.addEventListener('storage', actualizarEstados);
    
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener('storage', actualizarEstados);
    };
  }, []);

  const consultar = async (reporte) => {
    if (!reporte?.id || !reporte.ciudad) return;

    setCargando(true);
    setError('');
    try {
      const resultado = await buscarEmergencia(reporte.ciudad, reporte.id);
      if (!resultado) throw new Error('Tu reporte todavía no está disponible para consulta.');
      setEmergencias((actuales) => actuales.map((item) => item.id === reporte.id ? { ...item, ...resultado } : item));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <section className="tracking-panel panel-card">
      <h2>Seguimiento de mi reporte</h2>
      {emergencias.length === 0 && <p className="empty-state">Aún no tienes reportes guardados en este dispositivo.</p>}
      {error && <p role="alert">{error}</p>}
      {emergencias.map((emergencia) => <div className="tracking-details" key={emergencia.id}>
        <p><strong>ID</strong><span>{emergencia.id}</span></p>
        <p><strong>Ciudad</strong><span>{emergencia.ciudad}</span></p>
        <p><strong>Estado</strong><span className="state-badge">{emergencia.estado || 'recibido'}</span></p>
        <p><strong>Descripción</strong><span>{emergencia.descripcion}</span></p>
        {emergencia.evidenciaFotografica && <div className="tracking-evidence"><strong>Evidencia fotográfica</strong><img src={emergencia.evidenciaFotografica} alt="Evidencia de la emergencia" /></div>}
        <button className="btn-secondary" type="button" onClick={() => consultar(emergencia)} disabled={cargando}>Actualizar estado</button>
      </div>)}
    </section>
  );
}

CitizenTracking.propTypes = {
  reportes: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    ciudad: PropTypes.string,
    estado: PropTypes.string,
    descripcion: PropTypes.string,
    evidenciaFotografica: PropTypes.string,
  })),
};
