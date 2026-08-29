import { useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../lib/supabase';

const ciudades = [
  { value: 'cali', label: 'Cali' },
  { value: 'pereira', label: 'Pereira' },
  { value: 'manizales', label: 'Manizales' },
  { value: 'choco', label: 'Choco' },
];

export function LoginForm({ onLogin }) {
  const [modo, setModo] = useState('registro');
  const [datos, setDatos] = useState({
    nombre: '',
    correo: '',
    password: '',
    edad: '',
    ciudad: 'cali',
    rol: 'ciudadano',
    tipoOperador: '',
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const actualizarDato = (event) => {
    const { name, value } = event.target;
    setDatos((actuales) => ({ ...actuales, [name]: value }));
    setError('');
  };

  const cambiarModo = () => {
    setModo((actual) => actual === 'registro' ? 'login' : 'registro');
    setError('');
    setMensaje('');
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setMensaje('');

    if (datos.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (modo === 'registro' && (Number(datos.edad) < 18 || Number(datos.edad) > 120)) {
      setError('Debes tener entre 18 y 120 años para crear una cuenta.');
      return;
    }

    if (modo === 'registro' && datos.rol === 'operador' && !datos.tipoOperador) {
      setError('Los operadores deben seleccionar su tipo de función.');
      return;
    }

    const autenticarUsuario = async () => {
      setGuardando(true);
      setError('');
      const resultado = modo === 'registro'
        ? await supabase.auth.signUp({
          email: datos.correo.trim(),
          password: datos.password,
          options: {
            data: {
              nombre: datos.nombre.trim(),
              edad: Number(datos.edad),
              ciudad: datos.ciudad,
              rol: datos.rol,
              tipoOperador: datos.tipoOperador,
            },
          },
        })
        : await supabase.auth.signInWithPassword({
          email: datos.correo.trim(),
          password: datos.password,
        });

      if (resultado.error) {
        setError(modo === 'login' ? 'Correo o contraseña incorrectos.' : resultado.error.message);
      } else if (modo === 'registro' && !resultado.data.session) {
        setMensaje('Revisa tu correo para confirmar la cuenta antes de entrar.');
      } else {
        onLogin(resultado.data.user);
      }
      setGuardando(false);
    };

    autenticarUsuario().catch(() => {
      setError('No fue posible conectar con Supabase. Intenta nuevamente.');
      setGuardando(false);
    });
  };

  return (
    <main className="login-page">
      <section className="login-intro">
        <p className="eyebrow">Red de respuesta inmediata</p>
        <h1>Tu ciudad, más preparada.</h1>
        <p className="intro-copy">
          Ingresa tus datos para reportar una emergencia o coordinar la atención desde el centro operativo.
        </p>
        <div className="status-note">
          <span className="status-dot" aria-hidden="true" />
          Plataforma disponible
        </div>
      </section>

      <form className="login-card" onSubmit={handleSubmit}>
        <div className="form-heading">
          <p className="eyebrow">Acceso seguro</p>
          <h2>{modo === 'registro' ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
          <p>{modo === 'registro' ? 'Cuéntanos quién eres para mostrarte las herramientas correctas.' : 'Ingresa con tu correo y contraseña registrados.'}</p>
        </div>

        <div className="field-grid">
          {modo === 'registro' && <label>
              Nombre completo
              <input name="nombre" value={datos.nombre} onChange={actualizarDato} placeholder="Ej. Ana García" required />
            </label>}
          <label>
            Correo electrónico
            <input name="correo" type="email" value={datos.correo} onChange={actualizarDato} placeholder="ana@correo.com" required />
          </label>
          <label className={modo === 'login' ? 'field-wide' : ''}>
            Contraseña
            <input name="password" type="password" minLength="6" value={datos.password} onChange={actualizarDato} placeholder="Mínimo 6 caracteres" required />
          </label>
          {modo === 'registro' && <>
            <label>
              Edad
              <input name="edad" type="number" min="18" max="120" value={datos.edad} onChange={actualizarDato} placeholder="25" required />
            </label>
            <label>
              Ciudad
              <select name="ciudad" value={datos.ciudad} onChange={actualizarDato}>
                {ciudades.map((ciudad) => <option key={ciudad.value} value={ciudad.value}>{ciudad.label}</option>)}
              </select>
            </label>
          </>}
        </div>

        {modo === 'registro' && <fieldset className="role-fieldset">
          <legend>¿Cómo participarás?</legend>
          <label className="role-option">
            <input type="radio" name="rol" value="ciudadano" checked={datos.rol === 'ciudadano'} onChange={actualizarDato} />
            <span><strong>Soy ciudadano</strong><small>Reportar y consultar mis emergencias</small></span>
          </label>
          <label className="role-option">
            <input type="radio" name="rol" value="operador" checked={datos.rol === 'operador'} onChange={actualizarDato} />
            <span><strong>Soy operador</strong><small>Gestionar reportes y despachar ayuda</small></span>
          </label>
          </fieldset>}

        {modo === 'registro' && datos.rol === 'operador' && (
          <div className="operator-fields">
            <label>
              ¿Cuál es tu tipo de función?
              <select name="tipoOperador" value={datos.tipoOperador} onChange={actualizarDato} required>
                <option value="">Selecciona una opción</option>
                <option value="bombero">Bombero</option>
                <option value="rescatista">Rescatista</option>
                <option value="voluntario">Voluntario</option>
                <option value="medico">Médico</option>
              </select>
            </label>
          </div>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}
        {mensaje && <p className="form-message" role="status">{mensaje}</p>}
        <button className="primary-button" type="submit" disabled={guardando}>
          {guardando ? 'Conectando...' : modo === 'registro' ? 'Crear cuenta y continuar' : 'Entrar'} <span aria-hidden="true">→</span>
        </button>
        <button className="auth-switch" type="button" onClick={cambiarModo}>
          {modo === 'registro' ? '¿Ya tienes una cuenta? Cuenta ya existente' : '¿No tienes cuenta? Crear una nueva'}
        </button>
        <p className="privacy-note">Tus datos se usan únicamente para personalizar esta sesión.</p>
      </form>
    </main>
  );
}

LoginForm.propTypes = {
  onLogin: PropTypes.func.isRequired,
};
