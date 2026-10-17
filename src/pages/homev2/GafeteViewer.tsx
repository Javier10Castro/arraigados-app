import { useMemo } from 'react';
import IntroExperience from './IntroExperience';
import { buildBadge } from './credentialData';
import { usePulseSession } from '../../context/PulseSession';

/**
 * "Mi gafete": el mismo gafete de la animación de /homev2, pero a demanda (botón del menú lateral).
 * Se puede arrastrar, girar, descargar como imagen (frente + reverso). Se muestra sobre la pantalla actual.
 */
export default function GafeteViewer({ onClose }: { onClose: () => void }) {
  const { me, state } = usePulseSession();
  const badge = useMemo(
    () => {
      if (!me || state.phase !== 'ready') return null;
      const qr = state.team ? state.qrToken : state.token; // el equipo usa el QR de su pulsera asignada
      return qr ? buildBadge(me, `${window.location.origin}/p/${qr}`) : null;
    },
    [me, state],
  );
  if (!badge) return null;
  return <IntroExperience badge={badge} mode="viewer" leaving={false} onFinish={onClose} />;
}
