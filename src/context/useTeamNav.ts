import { useNavigate } from 'react-router-dom';
import { usePulseSession } from './PulseSession';
import { useStaffSession } from './StaffSession';

/**
 * Cambio entre la experiencia de equipo y la de visitante SIN cerrar sesión. Es solo navegación y vista: el servidor
 * decide los permisos en cada llamada (cookie del equipo), nada de esto concede privilegios.
 */
export function useTeamNav() {
  const navigate = useNavigate();
  const { isTeam, enterTeamView, leaveTeamView } = usePulseSession();
  const { user } = useStaffSession();
  return {
    isTeam,
    /** ¿Hay sesión del equipo con la que se pueda alternar? (el servidor la vuelve a validar al entrar). */
    canSwitch: user !== null && !user.mustChangePassword,
    /** Entra a la experiencia de visitante con la pulsera propia. */
    async toVisitor() {
      const r = await enterTeamView(); // 'none' / 'invalid' los explica TeamViewGate (en /home)
      if (r === 'denied') {
        navigate('/login'); // la sesión del equipo caducó: sin cookie válida no hay vista de visitante
        return r;
      }
      navigate('/home');
      return r;
    },
    /** Regresa al panel del equipo que le corresponde por su rol real. */
    toTeam() {
      leaveTeamView();
      navigate(user?.role === 'ADMIN' ? '/admin' : '/staff');
    },
  };
}
