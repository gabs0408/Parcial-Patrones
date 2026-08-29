import { useState } from 'react';
import PropTypes from 'prop-types';
import { crearEmergencia } from '../lib/api';

const prioridades = {
  usar_medica: 'P1',
  albergue: 'P2',
  suministros: 'P3',
  danos_estructurales: 'P4',
};

const leerImagen = (archivo) => new Promise((resolve, reject) => {
  if (!archivo) {
    resolve(null);
    return;
  }
  const lector = new FileReader();
  lector.onload = () => resolve(lector.result);
  lector.onerror = () => reject(new Error('No fue posible leer la evidencia fotográfica.'));
  lector.readAsDataURL(archivo);
});

export function EmergencyForm({ isMapsLoaded, onReportCreated }) {
  const [tipo, setTipo] = useState('usar_medica');
  const [ciudad, setCiudad] = useState('cali');
  const [descripcion, setDescripcion] = useState('');
  const [direccion, setDireccion] = useState('');
  const [datosCriticos, setDatosCriticos] = useState({
    personasAtrapadasHeridas: '',
    riesgoInminente: '',
    adultos: '',
    ninos: '',
    terceraEdad: '',
    accesibilidad: '',
    habitabilidad: '',
    categoriaInsumo: '',
    tipoEdificacion: '',
    nivelDanos: '',
    riesgoColapsoVias: '',
    evidenciaFotografica: null,
  });
  const [enviando, setEnviando] = useState(false);

  const actualizarDatoCritico = (event) => {
    const { name, value, files } = event.target;
    setDatosCriticos((actuales) => ({ ...actuales, [name]: files?.[0] || value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isMapsLoaded) {
      alert('Google Maps todavía está cargando. Intenta nuevamente en unos segundos.');
      return;
    }

    setEnviando(true);
    try {
      const geocoder = new window.google.maps.Geocoder();
      const resultado = await geocoder.geocode({
        address: `${direccion}, ${ciudad}`,
        region: 'CO',
      });
      const ubicacion = resultado.results[0]?.geometry.location;

      if (!ubicacion) {
        throw new Error('No se encontró esa dirección. Verifica los datos e intenta nuevamente.');
      }

      const evidenciaDataUrl = await leerImagen(datosCriticos.evidenciaFotografica);
      const res = await crearEmergencia({
        tipo,
        prioridad: prioridades[tipo],
        ciudad,
        direccion,
        ubicacion: { lat: ubicacion.lat(), lng: ubicacion.lng() },
        descripcion,
        datos_criticos: {
          ...datosCriticos,
          evidenciaFotografica: datosCriticos.evidenciaFotografica?.name || null,
        },
      });
      alert('Emergencia reportada exitosamente con ID: ' + res.id);
      onReportCreated({
        id: res.id,
        tipo,
        prioridad: prioridades[tipo],
        ciudad,
        estado: res.estado || 'recibido',
        direccion,
        ubicacion: { lat: ubicacion.lat(), lng: ubicacion.lng() },
        descripcion,
        datos_criticos: { ...datosCriticos, evidenciaFotografica: evidenciaDataUrl },
        evidenciaFotografica: evidenciaDataUrl,
      });
      setDescripcion('');
      setDireccion('');
      setDatosCriticos({
        personasAtrapadasHeridas: '', riesgoInminente: '', adultos: '', ninos: '', terceraEdad: '',
        accesibilidad: '', habitabilidad: '', categoriaInsumo: '', tipoEdificacion: '', nivelDanos: '',
        riesgoColapsoVias: '', evidenciaFotografica: null,
      });
    } catch (err) {
      console.error('Error enviando la emergencia:', err);
      alert(`Error enviando la emergencia: ${err.message}`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className="emergency-form panel-card" onSubmit={handleSubmit}>
      <h2>Reportar Emergencia</h2>
      <div className="form-fields">
      <label htmlFor="tipo-emergencia">Tipo de solicitud:</label>
      <select id="tipo-emergencia" value={tipo} onChange={(e) => setTipo(e.target.value)}>
        <option value="usar_medica">USAR / Emergencia médica (P1 - Crítica)</option>
        <option value="albergue">Albergue y refugio temporal (P2 - Alta)</option>
        <option value="suministros">Suministros y asistencia humanitaria (P3 - Media)</option>
        <option value="danos_estructurales">Evaluación de daños estructurales (P4 - Preventiva)</option>
      </select>

      <label htmlFor="ciudad-emergencia">Ciudad:</label>
      <select id="ciudad-emergencia" value={ciudad} onChange={(e) => setCiudad(e.target.value)}>
        <option value="choco">Chocó</option>
        <option value="pereira">Pereira</option>
        <option value="cali">Cali</option>
        <option value="manizales">Manizales</option>
      </select>

      <label htmlFor="direccion">Dirección del lugar:</label>
      <input
        id="direccion"
        type="text"
        value={direccion}
        onChange={(e) => setDireccion(e.target.value)}
        placeholder="Ej. Calle 5 # 10-20"
        required
      />

      <label htmlFor="descripcion-emergencia">Descripción:</label>
      <textarea id="descripcion-emergencia" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required />

      {tipo === 'usar_medica' && <div className="critical-fields">
        <h3>Datos críticos P1</h3>
        <label htmlFor="personas-atrapadas">Personas atrapadas o heridas:
          <input id="personas-atrapadas" name="personasAtrapadasHeridas" type="number" min="0" value={datosCriticos.personasAtrapadasHeridas} onChange={actualizarDatoCritico} required />
        </label>
        <label htmlFor="riesgo-inminente">Condición de riesgo inminente:
          <select id="riesgo-inminente" name="riesgoInminente" value={datosCriticos.riesgoInminente} onChange={actualizarDatoCritico} required>
            <option value="">Selecciona una opción</option><option value="fuga_gas">Fuga de gas</option><option value="fuego">Fuego</option><option value="ambos">Fuga de gas y fuego</option><option value="ninguno">Ninguno identificado</option>
          </select>
        </label>
      </div>}

      {tipo === 'albergue' && <div className="critical-fields">
        <h3>Datos críticos P2</h3>
        <div className="number-fields">
          <label htmlFor="adultos">Adultos<input id="adultos" name="adultos" type="number" min="0" value={datosCriticos.adultos} onChange={actualizarDatoCritico} required /></label>
          <label htmlFor="ninos">Niños<input id="ninos" name="ninos" type="number" min="0" value={datosCriticos.ninos} onChange={actualizarDatoCritico} required /></label>
          <label htmlFor="tercera-edad">Tercera edad<input id="tercera-edad" name="terceraEdad" type="number" min="0" value={datosCriticos.terceraEdad} onChange={actualizarDatoCritico} required /></label>
        </div>
        <label htmlFor="accesibilidad">Requerimientos de accesibilidad:
          <input id="accesibilidad" name="accesibilidad" value={datosCriticos.accesibilidad} onChange={actualizarDatoCritico} placeholder="Ej. rampas, silla de ruedas" required />
        </label>
        <label htmlFor="habitabilidad">Estado de habitabilidad de la vivienda:
          <select id="habitabilidad" name="habitabilidad" value={datosCriticos.habitabilidad} onChange={actualizarDatoCritico} required><option value="">Selecciona una opción</option><option value="habitable">Habitable</option><option value="parcial">Parcialmente habitable</option><option value="inhabitable">Inhabitable</option></select>
        </label>
      </div>}

      {tipo === 'suministros' && <div className="critical-fields">
        <h3>Datos críticos P3</h3>
        <label htmlFor="categoria-insumo">Categoría de insumo requerido:
          <select id="categoria-insumo" name="categoriaInsumo" value={datosCriticos.categoriaInsumo} onChange={actualizarDatoCritico} required><option value="">Selecciona una opción</option><option value="agua_potable">Agua potable</option><option value="raciones">Raciones de campaña</option><option value="primeros_auxilios">Kits de primeros auxilios</option><option value="medicamentos_cronicos">Medicamentos crónicos</option></select>
        </label>
      </div>}

      {tipo === 'danos_estructurales' && <div className="critical-fields">
        <h3>Datos críticos P4</h3>
        <label htmlFor="tipo-edificacion">Tipo de edificación:
          <select id="tipo-edificacion" name="tipoEdificacion" value={datosCriticos.tipoEdificacion} onChange={actualizarDatoCritico} required><option value="">Selecciona una opción</option><option value="residencial">Residencial</option><option value="hospital">Hospital</option><option value="escuela">Escuela</option><option value="puente">Puente</option><option value="otra_critica">Otra infraestructura crítica</option></select>
        </label>
        <label htmlFor="nivel-danos">Nivel de agrietamiento o asentamiento:
          <select id="nivel-danos" name="nivelDanos" value={datosCriticos.nivelDanos} onChange={actualizarDatoCritico} required><option value="">Selecciona una opción</option><option value="leve">Leve</option><option value="moderado">Moderado</option><option value="severo">Severo</option></select>
        </label>
        <label htmlFor="evidencia-fotografica">Evidencia fotográfica:
          <input id="evidencia-fotografica" name="evidenciaFotografica" type="file" accept="image/*" onChange={actualizarDatoCritico} required />
        </label>
        {datosCriticos.evidenciaFotografica && <img className="evidence-preview" src={URL.createObjectURL(datosCriticos.evidenciaFotografica)} alt="Vista previa de la evidencia" />}
        <label htmlFor="riesgo-colapso">¿Existe riesgo de colapso sobre vías?
          <select id="riesgo-colapso" name="riesgoColapsoVias" value={datosCriticos.riesgoColapsoVias} onChange={actualizarDatoCritico} required><option value="">Selecciona una opción</option><option value="si">Sí</option><option value="no">No</option><option value="incierto">No se puede determinar</option></select>
        </label>
      </div>}
      </div>
      <button className="primary-button" type="submit" disabled={enviando || !isMapsLoaded}>
        {enviando ? 'Buscando dirección...' : 'Enviar Reporte'}
      </button>
    </form>
  );
}

EmergencyForm.propTypes = {
  isMapsLoaded: PropTypes.bool.isRequired,
  onReportCreated: PropTypes.func.isRequired,
};