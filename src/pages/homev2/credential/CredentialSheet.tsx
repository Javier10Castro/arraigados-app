import CredentialFront from './CredentialFront';
import CredentialBack from './CredentialBack';
import type { CredentialBadge } from '../credentialData';

/** Medidas del arte de la credencial (px a escala 1; el resto de medidas son múltiplos de `--u`). */
export const SHEET_CARD_W = 260;
export const SHEET_CARD_H = 400;
const GAP = 36;
const PAD = 44;
export const SHEET_W = PAD * 2 + SHEET_CARD_W * 2 + GAP;
export const SHEET_H = PAD * 2 + SHEET_CARD_H;

/**
 * Frente y reverso PLANOS, lado a lado, sin 3D ni física. Solo sirve para exportar la credencial como imagen
 * (se renderiza fuera de pantalla y se serializa en `exportCredential.ts`).
 */
export default function CredentialSheet({ badge }: { badge: CredentialBadge }) {
  const face = (side: 'front' | 'back') => (
    <div className="cred-flat" style={{ width: SHEET_CARD_W, height: SHEET_CARD_H, position: 'relative', ['--u' as string]: 1 }}>
      <div className={`badge-face cred-face cred-face-${side}`}>
        {side === 'front' ? <CredentialFront badge={badge} /> : <CredentialBack badge={badge} />}
        <div className="cred-slot" aria-hidden="true" />
      </div>
    </div>
  );
  return (
    <div className="cred-export" style={{ width: SHEET_W, height: SHEET_H, padding: PAD, display: 'flex', gap: GAP, boxSizing: 'border-box' }}>
      {face('front')}
      {face('back')}
    </div>
  );
}
