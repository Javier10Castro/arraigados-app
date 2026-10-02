import { useNavigate } from 'react-router-dom';
import Ambient from './Ambient';
import Button from './Button';
import Wordmark from './Wordmark';
import { usePulseSession } from '../context/PulseSession';
import styles from './SessionGate.module.css';

/**
 * Pantalla breve mientras se valida una sesión, o si falla la conexión.
 * - Sin props: sesión del ASISTENTE (pulsera guardada en el celular).
 * - Con message/onRetry: uso genérico (p. ej. sesión de Staff).
 */
export default function SessionGate({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const navigate = useNavigate();
  const { state, setToken, signOut } = usePulseSession();

  if (message !== undefined) {
    return (
      <Shell>
        <p className={styles.text}>{message}</p>
        {onRetry && (
          <div className={styles.actions}>
            <Button block onClick={onRetry}>
              Reintentar
            </Button>
          </div>
        )}
      </Shell>
    );
  }

  return (
    <Shell>
      {state.phase === 'error' ? (
        <>
          <p className={styles.text}>{state.message}</p>
          <div className={styles.actions}>
            <Button block onClick={() => setToken(state.token)}>
              Reintentar
            </Button>
            <Button
              block
              variant="outlineLight"
              onClick={() => {
                signOut();
                navigate('/registro');
              }}
            >
              Escanear mi pulsera
            </Button>
          </div>
        </>
      ) : (
        <p className={styles.text}>Cargando tu pulsera…</p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.screen}>
      <Ambient variant="dark" />
      <main className={styles.body} aria-live="polite">
        <Wordmark className={styles.mark} variant="cream" />
        {children}
      </main>
    </div>
  );
}
