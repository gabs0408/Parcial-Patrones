import { GoogleMap, MarkerF, InfoWindowF } from '@react-google-maps/api';
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { CITIES } from '../config/cities';

export function MapView({ ciudadSeleccionada, emergencias = [] }) {
  const centro = CITIES[ciudadSeleccionada] || CITIES.cali;
  const centroMapa = { lat: centro.lat, lng: centro.lng };
  const [emergenciaSeleccionada, setEmergenciaSeleccionada] = useState(null);

  useEffect(() => {
    if (emergenciaSeleccionada && !emergencias.some((item) => item.id === emergenciaSeleccionada.id)) {
      setEmergenciaSeleccionada(null);
    }
  }, [emergencias, emergenciaSeleccionada]);

  return (
    <GoogleMap
      center={centroMapa}
      zoom={12} 
      style={{ height: '500px', width: '100%' }}
      mapContainerStyle={{ height: '500px', width: '100%' }}
    >
      {emergencias.map((item) => (
        <MarkerF
          key={item.id}
          position={item.ubicacion}
          label={item.prioridad}
          onClick={() => setEmergenciaSeleccionada(item)}
        />
      ))}
      {emergenciaSeleccionada && (
        <InfoWindowF
          position={emergenciaSeleccionada.ubicacion}
          onCloseClick={() => setEmergenciaSeleccionada(null)}
        >
          <div>
            <strong>{emergenciaSeleccionada.tipo}</strong> <br />
            Dirección: {emergenciaSeleccionada.direccion || 'No disponible'} <br />
            {emergenciaSeleccionada.descripcion} <br />
            Prioridad: {emergenciaSeleccionada.prioridad}
          </div>
        </InfoWindowF>
      )}
    </GoogleMap>
  );
}

MapView.propTypes = {
  ciudadSeleccionada: PropTypes.string.isRequired,
  emergencias: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      tipo: PropTypes.string,
      prioridad: PropTypes.string,
      direccion: PropTypes.string,
      descripcion: PropTypes.string,
      ubicacion: PropTypes.shape({
        lat: PropTypes.number.isRequired,
        lng: PropTypes.number.isRequired,
      }).isRequired,
    })
  ),
};