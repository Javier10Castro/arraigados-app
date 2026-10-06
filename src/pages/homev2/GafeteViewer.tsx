import { useMemo } from 'react';
import IntroExperience from './IntroExperience';
import { buildBadge } from './credentialData';
import { usePulseSession } from '../../context/PulseSession';

/**
 * "Mi gafete": el mismo gafete de la animación de /homev2, pero a demanda (botón del menú lateral).
 * Se puede arrastrar, girar y descargar como imagen (frente + reverso). Se muestra sobre la pantalla actual.
 */
export default function GafeteViewer({ onClose }: { onClose: () => void }) {
  const { me, state } = usePulseSession();
  const badge = useMemo(
    () => (me && state.phase === 'ready' ? buildBadge(me, `${window.location.origin}/p/${state.token}`) : null),
    [me, state],
  );
  if (!badge) return null;
  return <IntroExperience badge={badge} mode="viewer" leaving={false} onFinish={onClose} />;
}
