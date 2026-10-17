import { useNavigate } from 'react-router-dom';
import Ambient from './Ambient';
import Button from './Button';
import Wordmark from './Wordmark';
import { usePulseSession } from '../context/PulseSession';
import { useStaffSession } from '../context/StaffSession';
import styles from './SessionGate.module.css';

/**
 * Vista de visitante del EQUIPO sin pulsera utilizable. Staff NO puede vincularse una pulsera por su cuenta:
 * solo un Admin autorizado la asigna (Admin -> Usuarios). Aquí se explica y se ofrece volver al panel del equipo.
 */
export default function TeamViewGate({ reason }: { reason: 'none' | 'invalid' }) {
  const navigate = useNavigate();
  const { leaveTeamView } = usePulseSession();
  const { user } = useStaffSession();
  const back = () => {
    leaveTeamView();
    navigate(user?.role === 'ADMIN' ? '/admin' : '/staff', { replace: true });
  };
  const label = user?.role === 'ADMIN' ? 'Volver a Admin' : 'Volver a Staff';
  return (
    <div className={styles.screen}>
      <Ambient variant="dark" />
      <main className={styles.body} aria-live="polite">
        <Wordmark className={styles.mark} variant="cream" />
        <p className={styles.text}>
          {reason === 'none'
            ? 'Tu cuenta todavía no tiene una pulsera asignada. Pide a un Admin que la vincule a tu cuenta.'
            : 'La pulsera de tu cuenta está deshabilitada. Pide a un Admin que te asigne una nueva.'}
        </p>
        <div className={styles.actions}>
          <Button block onClick={back}>
            {label}
          </Button>
        </div>
      </main>
    </div>
  );
}
