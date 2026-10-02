import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Eye, EyeOff, KeyRound } from 'lucide-react';
import Wordmark from '../components/Wordmark';
import RingsMark from '../components/RingsMark';
import Button from '../components/Button';
import Ambient from '../components/Ambient';
import { homeForRole, useStaffSession } from '../context/StaffSession';
import styles from './Login.module.css';

/**
 * Crear / cambiar la contraseña de Staff o Admin.
 * - Si la cuenta entró con una contraseña TEMPORAL (puesta por Admin), esta
 *   pantalla es obligatoria: no se puede usar nada más hasta terminarla.
 * - También sirve para que cualquiera cambie su contraseña cuando quiera.
 * Al guardar, la contraseña anterior deja de valer y las otras sesiones se cierran.
 */

/**
 * Mismo límite que passwordProblem() del servidor (bcrypt solo usa los
 * primeros 72 bytes). Buffer.byteLength(s, 'utf8') equivale a
 * TextEncoder().encode(s).length, así que un texto con acentos, ñ o emoji se
 * mide igual aquí que en la Function.
 */
const MAX_PASSWORD_BYTES = 72;
const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

export default function CambiarContrasena() {
  const navigate = useNavigate();
  const { user, changePassword, signOut } = useStaffSession();
  const forced = Boolean(user?.mustChangePassword);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const laActual = forced ? 'contraseña temporal' : 'contraseña actual';
  const hasCurrent = current.length > 0;
  const longEnough = next.length >= 8;
  const withinBytes = next.length > 0 && utf8Bytes(next) <= MAX_PASSWORD_BYTES;
  const matches = next.length > 0 && next === confirm;
  const different = next.length > 0 && next !== current;
  const valid = hasCurrent && longEnough && withinBytes && matches && different;

  /**
   * Primero que falta, para explicar el botón deshabilitado en vez de
   * fallar en silencio. No reemplaza al servidor: solo evita mandar una
   * petición que POST /api/auth/password va a rechazar.
   */
  const firstProblem = (): string | null => {
    if (!hasCurrent) return `Escribe tu ${laActual}.`;
    if (!longEnough) return 'La nueva contraseña debe tener al menos 8 caracteres.';
    if (!withinBytes) return `La contraseña es demasiado larga (máximo ${MAX_PASSWORD_BYTES} bytes).`;
    if (!matches) return 'La nueva contraseña y su confirmación no coinciden.';
    if (!different) return `La nueva contraseña debe ser distinta a la ${laActual}.`;
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const problem = firstProblem();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await changePassword(current, next);
      navigate(homeForRole(updated), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar tu contraseña.');
    } finally {
      setBusy(false);
    }
  };

  const input = (
    id: string,
    name: string,
    value: string,
    set: (v: string) => void,
    autoComplete: string,
    placeholder: string,
  ) => (
    <span className={styles.control}>
      <KeyRound className={styles.icon} size={17} strokeWidth={2} />
      <input
        id={id}
        name={name}
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          setError(null);
          set(e.target.value);
        }}
      />
    </span>
  );

  return (
    <div className={styles.screen}>
      <Ambient variant="dark" />

      <header className={styles.header}>
        {forced ? (
          <span className={styles.spacer} />
        ) : (
          <button type="button" className={styles.back} aria-label="Volver" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} strokeWidth={2.2} />
          </button>
        )}
        <div className={styles.brand}>
          <Wordmark className={styles.mark} variant="cream" />
          <span className={styles.brandLabel}>{user?.role === 'ADMIN' ? 'Admin' : 'Staff'}</span>
        </div>
        <span className={styles.spacer} />
      </header>

      <main className={styles.body}>
        <div className={styles.intro}>
          <h1>{forced ? 'Crea tu contraseña' : 'Cambiar mi contraseña'}</h1>
          <p>
            {forced
              ? `Hola${user ? `, ${user.name.split(' ')[0]}` : ''}. Entraste con una contraseña temporal: crea una propia para continuar. Solo tú la conocerás.`
              : 'Al guardarla, se cerrarán tus sesiones abiertas en otros dispositivos.'}
          </p>
        </div>

        <form className={styles.form} onSubmit={submit} noValidate>
          <label className={styles.field} htmlFor="pw-current">
            <span className={styles.label}>{forced ? 'Contraseña temporal' : 'Contraseña actual'}</span>
            {input('pw-current', 'currentPassword', current, setCurrent, 'current-password', '••••••••')}
          </label>
          <label className={styles.field} htmlFor="pw-new">
            <span className={styles.label}>Nueva contraseña</span>
            {input('pw-new', 'newPassword', next, setNext, 'new-password', 'Mínimo 8 caracteres')}
          </label>
          <label className={styles.field} htmlFor="pw-confirm">
            <span className={styles.label}>Confirma la nueva contraseña</span>
            {input('pw-confirm', 'newPasswordConfirm', confirm, setConfirm, 'new-password', 'Escríbela otra vez')}
          </label>

          <ul className={styles.rules} aria-label="Requisitos">
            <Rule ok={hasCurrent}>Escribe tu {laActual}</Rule>
            <Rule ok={longEnough}>Al menos 8 caracteres</Rule>
            <Rule ok={withinBytes}>Máximo {MAX_PASSWORD_BYTES} bytes</Rule>
            <Rule ok={matches}>Las dos coinciden</Rule>
            <Rule ok={different}>Distinta a la {laActual}</Rule>
          </ul>

          <button type="button" className={styles.showToggle} onClick={() => setShow((v) => !v)}>
            {show ? <EyeOff size={15} strokeWidth={2} /> : <Eye size={15} strokeWidth={2} />}
            {show ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
          </button>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <Button type="submit" block disabled={busy || !valid}>
            {busy ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
        </form>

        {forced && (
          <p className={styles.alt}>
            ¿No eres tú?{' '}
            <button
              type="button"
              className={styles.link}
              onClick={() => void signOut().then(() => navigate('/login', { replace: true }))}
            >
              Cerrar sesión
            </button>
          </p>
        )}

        <div className={styles.footer}>
          <RingsMark className={styles.rings} />
        </div>
      </main>
    </div>
  );
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={ok ? styles.ruleOk : undefined}>
      <Check size={13} strokeWidth={3} aria-hidden="true" />
      <span>{children}</span>
      <span className="sr-only">{ok ? '(cumplido)' : '(pendiente)'}</span>
    </li>
  );
}
