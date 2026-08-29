import { useState, useEffect } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { LoginForm } from './components/LoginForm';
import { EmergencyForm } from './components/EmergencyForm';
import { CitizenTracking } from './components/CitizenTracking';
import { OperatorPanel } from './components/OperatorPanel';
import { supabase } from './lib/supabase';
import './App_new.css';

const GOOGLE_MAPS_LIBRARIES = [];

function App() {
  const [usuario, setUsuario] = useState(null);
  const [rol, setRol] = useState('ciudadano');
  const [ciudadSeleccionada, setCiudadSeleccionada] = useState('cali');
  const [reportes, setReportes] = useState(() => {
    try {
      const guardados = JSON.parse(localStorage.getItem('reportes-emergencias') || '[]');
      const ultimo = JSON.parse(localStorage.getItem('ultimo-reporte'));
      return ultimo && !guardados.some((item) => item.id === ultimo.id) ? [...guardados, ultimo] : guardados;
    } catch {
      return [];
    }
  });

  // Verificar sesión al cargar
  useEffect(() => {
    const verificarSesion = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUsuario(session.user);
        const rolUsuario = session.user.user_metadata?.rol || 'ciudadano';
        setRol(rolUsuario);
        const ciudadUsuario = session.user.user_metadata?.ciudad || 'cali';
        setCiudadSeleccionada(ciudadUsuario);
      }
    };
    verificarSesion();

    // Escuchar cambios de sesión
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUsuario(session.user);
        const rolUsuario = session.user.user_metadata?.rol || 'ciudadano';
        setRol(rolUsuario);
        const ciudadUsuario = session.user.user_metadata?.ciudad || 'cali';
        setCiudadSeleccionada(ciudadUsuario);
      } else {
        setUsuario(null);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  // Cuando cambias de rol, solo el ciudadano mantiene los reportes
  useEffect(() => {
    if (rol === 'operador') {
      // Operador: sin reportes locales
      setReportes([]);
    } else {
      // Ciudadano: restaura desde localStorage
      try {
        const guardados = JSON.parse(localStorage.getItem('reportes-emergencias') || '[]');
        const ultimo = JSON.parse(localStorage.getItem('ultimo-reporte'));
        setReportes(ultimo && !guardados.some((item) => item.id === ultimo.id) ? [...guardados, ultimo] : guardados);
      } catch {
        setReportes([]);
      }
    }
  }, [rol]);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const guardarReporte = (reporte) => {
    // Solo guardar en localStorage si es ciudadano
    if (rol === 'ciudadano') {
      localStorage.setItem('ultimo-reporte', JSON.stringify(reporte));
      const reportesGuardados = JSON.parse(localStorage.getItem('reportes-emergencias') || '[]');
      localStorage.setItem('reportes-emergencias', JSON.stringify([
        ...reportesGuardados.filter((item) => item.id !== reporte.id),
        reporte,
      ]));
    }
    setReportes((actuales) => [...actuales.filter((item) => item.id !== reporte.id), reporte]);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUsuario(null);
    setReportes([]);
  };

  if (!usuario) {
    return <LoginForm onLogin={setUsuario} />;
  }

  const perfil = usuario.user_metadata || {};

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Sistema de Gestión de Emergencias</p>
          <h1>{perfil.rol === 'ciudadano' ? 'Panel ciudadano' : 'Centro operativo'}</h1>
        </div>
        <div className="user-actions">
          <span>{perfil.nombre || usuario.email} · {perfil.ciudad || 'Sin ciudad'}</span>
          <span className="demo-badge">Autenticado</span>
          <button className="btn-logout" type="button" onClick={handleLogout} title="Cerrar sesión">🚪 Salir</button>
          <div className="role-switch" aria-label="Cambiar vista">
            <button className={perfil.rol === 'ciudadano' ? 'active' : ''} type="button" onClick={() => setRol('ciudadano')}>Ciudadano</button>
            <button className={perfil.rol === 'operador' ? 'active' : ''} type="button" onClick={() => setRol('operador')}>Operador</button>
          </div>
        </div>
      </header>

      <div className="content-area">
        {perfil.rol === 'ciudadano' ? (
          <div>
            <p className="page-lead">Reporta una situación y consulta el estado de tu solicitud.</p>
            <EmergencyForm isMapsLoaded={isLoaded} onReportCreated={guardarReporte} />
            <CitizenTracking reportes={reportes} />
          </div>
        ) : (
          <div>
            {loadError && <p role="alert">Error cargando Google Maps: {loadError.message}</p>}
            {isLoaded ? <OperatorPanel ciudadSeleccionada={ciudadSeleccionada} onCiudadChange={setCiudadSeleccionada} isMapsLoaded={isLoaded} /> : <p>Cargando Google Maps...</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
