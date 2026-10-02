import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, KeyRound, Mail } from 'lucide-react';
import Wordmark from '../components/Wordmark';
import RingsMark from '../components/RingsMark';
import Button from '../components/Button';
import Ambient from '../components/Ambient';
import { homeForRole, useStaffSession } from '../context/StaffSession';
import styles from './Login.module.css';

/**
 * Ingreso de STAFF y ADMIN con su cuenta de la tabla "User" (la misma del
 * Next.js). Los asistentes no usan esta pantalla: entran escaneando su pulsera.
 */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, user, signIn, signOut } = useStaffSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Si vino de una pantalla protegida, regresa ahí (salvo que deba crear su contraseña primero).
  const from = (location.state as { from?: string } | null)?.from;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const signed = await signIn(email, password);
      // Staff no puede entrar al panel de Admin aunque haya llegado desde ahí.
      const canUseFrom = from && !(from.startsWith('/admin') && signed.role !== 'ADMIN');
      navigate(!signed.mustChangePassword && canUseFrom ? from : homeForRole(signed), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos iniciar sesión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.screen}>
      <Ambient variant="dark" />

      <header className={styles.header}>
        <button type="button" className={styles.back} aria-label="Volver" onClick={() => navigate('/')}>
          <ArrowLeft size={20} strokeWidth={2.2} />
        </button>
        <div className={styles.brand}>
          <Wordmark className={styles.mark} variant="cream" />
          <span className={styles.brandLabel}>Staff</span>
        </div>
        <span className={styles.spacer} />
      </header>

      <main className={styles.body}>
        <div className={styles.intro}>
          <h1>INGRESO DEL STAFF</h1>
          <p>Entra con tu correo y contraseña del equipo del congreso.</p>
        </div>

        {user ? (
          <div className={styles.form}>
            <p className={styles.signedIn}>
              Ya iniciaste sesión como <strong>{user.name}</strong>.
            </p>
            <Button block onClick={() => navigate(homeForRole(user), { replace: true })}>
              {user.mustChangePassword ? 'Crear mi contraseña' : 'Continuar'}
            </Button>
            <Button block variant="outline" onClick={() => void signOut()}>
              Cerrar sesión
            </Button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={submit} noValidate>
            <label className={styles.field}>
              <span className={styles.label}>Correo</span>
              <span className={styles.control}>
                <Mail className={styles.icon} size={17} strokeWidth={2} />
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="tucorreo@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </span>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Contraseña</span>
              <span className={styles.control}>
                <KeyRound className={styles.icon} size={17} strokeWidth={2} />
                <input
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.toggle}
                  aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setShow((v) => !v)}
                >
                  {show ? <EyeOff size={17} strokeWidth={2} /> : <Eye size={17} strokeWidth={2} />}
                </button>
              </span>
            </label>

            {(error || state.phase === 'error') && (
              <p className={styles.error} role="alert">
                {error ?? (state.phase === 'error' ? state.message : '')}
              </p>
            )}

            <Button type="submit" block disabled={busy || !email.trim() || !password}>
              {busy ? 'Entrando…' : 'Iniciar sesión'}
            </Button>
          </form>
        )}

        <p className={styles.alt}>
          ¿Eres asistente?{' '}
          <button type="button" className={styles.link} onClick={() => navigate('/registro')}>
            Escanea tu pulsera
          </button>
        </p>

        <div className={styles.footer}>
          <RingsMark className={styles.rings} />
        </div>
      </main>
    </div>
  );
}
