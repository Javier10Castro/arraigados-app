import CredentialFront from './CredentialFront';
import CredentialBack from './CredentialBack';
import type { CardProps } from '../hanging/HangingBadge';

/**
 * Ancho de referencia del que parte el escalado interno.
 * El resto de medidas de la credencial son múltiplos de `--u`
 * (`cardWidth / 260`), así el diseño es idéntico a 235 px y a 260 px.
 */
const REFERENCE_WIDTH = 260;

/**
 * Contenedor 3D de la credencial: frente y reverso con las mismas medidas.
 *
 * Este componente se inyecta en `HangingBadge` mediante la prop `cardComponent`,
 * de modo que el cordón, el mosquetón, la física y las sombras siguen siendo los
 * de Hanging Cards. Sólo la tarjeta se sustituye.
 *
 * El giro REUTILIZA el mecanismo existente del proyecto: la clase `flipped` de
 * `.badge-3d-wrapper` (rotateY) más `backface-visibility: hidden`. Lo único que
 * se añade es un pulso de brillo a mitad de giro, para que se lea como una
 * tarjeta física que capta la luz al volver.
 */
export default function CredentialCard({ badge, isFlipped, glare, cardWidth, cardHeight, isTurning }: CardProps) {
  const unit = cardWidth / REFERENCE_WIDTH;
  const frontGlare =
    glare && glare.opacity > 0
      ? `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,${glare.opacity * 1.3}), transparent 62%)`
      : 'none';

  return (
    <div
      className={`badge-3d-wrapper cred-card ${isFlipped ? 'flipped' : ''} ${
        isTurning ? 'is-turning' : ''
      }`}
      style={{ width: cardWidth, height: cardHeight, ['--u' as string]: unit }}
    >
      {/* Frente */}
      <div className="badge-face cred-face cred-face-front">
        <CredentialFront badge={badge} />
        {/* Ranura del agujetas: el mosquetón pasa por el orificio. */}
        <div className="cred-slot" aria-hidden="true" />
        <div className="cred-glare" style={{ background: frontGlare }} aria-hidden="true" />
      </div>

      {/* Reverso — mismas medidas, giro de 180° para mostrarlo. */}
      <div className="badge-face cred-face cred-face-back">
        <CredentialBack badge={badge} />
        <div className="cred-slot" aria-hidden="true" />
      </div>
    </div>
  );
}