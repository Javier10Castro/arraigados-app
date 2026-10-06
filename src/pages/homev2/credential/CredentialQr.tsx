import { useMemo } from 'react';
import QRCode from 'qrcode';

/**
 * Código QR de la credencial. Usa la MISMA librería `qrcode` que ya tiene la app (sin dependencias nuevas).
 * `value` es lo que devuelve el QR al escanearlo (aquí: la URL de la pulsera, igual que el QR físico).
 * Los módulos se dibujan en blanco directamente sobre el morado del gafete (tono "light").
 */
export default function CredentialQr({ value, size = 54, label }: { value: string; size?: number; label?: string }) {
  const built = useMemo(() => {
    try {
      const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
      const n = qr.modules.size;
      const quiet = 3;
      let path = '';
      for (let y = 0; y < n; y++) {
        let x = 0;
        while (x < n) {
          if (!qr.modules.get(y, x)) {
            x++;
            continue;
          }
          const start = x;
          while (x < n && qr.modules.get(y, x)) x++;
          path += `M${start + quiet} ${y + quiet}h${x - start}v1h-${x - start}z`;
        }
      }
      return { path, box: n + quiet * 2 };
    } catch {
      return null;
    }
  }, [value]);

  if (!built) return null;
  return (
    <div className="cred-qr-block is-light">
      <div className="cred-qr" style={{ width: size, height: size }}>
        <svg className="cred-qr-svg" viewBox={`0 0 ${built.box} ${built.box}`} width={size} height={size} shapeRendering="crispEdges" role="img" aria-label={label ?? 'Código QR de tu pulsera'}>
          <path className="cred-qr-modules" d={built.path} />
        </svg>
      </div>
    </div>
  );
}
