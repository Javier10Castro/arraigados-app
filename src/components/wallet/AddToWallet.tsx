import { useEffect, useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import Button from '../Button';
import { api } from '../../lib/api';
import { detectPlatform } from '../../lib/walletPlatform';
import styles from './AddToWallet.module.css';

/**
 * «Agregar a Wallet»: guarda la credencial digital en Apple Wallet (iPhone) o Google Wallet (Android).
 *  · Solo se muestra si el servidor tiene configurada al menos una plataforma (GET /api/wallet/status). Si no hay
 *    certificados/cuentas, NO aparece ningún botón (no se simula nada).
 *  · `token`: token privado de la pulsera del asistente; sin token (equipo) se usa la cookie de la sesión. Nunca se manda
 *    un id: el servidor decide de quién es la credencial.
 *  · Apple: el servidor da un enlace corto firmado y el navegador abre el .pkpass (iOS muestra su hoja «Agregar»).
 *    Google: el servidor da el enlace firmado «Add to Google Wallet» y se abre la hoja oficial de Google.
 *  · `variant="inline"`: botones sueltos para el visor «Mi gafete» (ahí vive la acción); `card`: tarjeta independiente.
 *  · La plataforma se deduce del navegador (no es infalible): en cualquier otro dispositivo se ofrecen las dos opciones.
 */
type Status = { apple: boolean; google: boolean };

export default function AddToWallet({ token, variant = 'card' }: { token?: string; variant?: 'card' | 'inline' }) {
  const [status, setStatus] = useState<Status | 'loading' | 'error'>('loading');
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState('');
  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints, navigator.platform);

  useEffect(() => {
    let alive = true;
    api
      .walletStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, []);

  if (status === 'loading' || status === 'error' || (!status.apple && !status.google)) return null; // sin configuración: sin botón

  const go = async (which: 'apple' | 'google') => {
    if (busy) return;
    setBusy(which);
    setError('');
    try {
      const { url } = await (which === 'apple' ? api.walletAppleTicket(token) : api.walletGoogle(token));
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo preparar tu credencial. Inténtalo de nuevo.');
    } finally {
      window.setTimeout(() => setBusy(null), 3000); // el teléfono abre su hoja; se permite reintentar
    }
  };

  const options: { id: 'apple' | 'google'; label: string; enabled: boolean }[] = [
    { id: 'apple', label: 'Agregar a Apple Wallet', enabled: status.apple },
    { id: 'google', label: 'Agregar a Google Wallet', enabled: status.google },
  ];
  const visible = platform === 'ios' ? options.filter((o) => o.id === 'apple') : platform === 'android' ? options.filter((o) => o.id === 'google') : options;
  const usable = visible.filter((o) => o.enabled);
  const other = options.filter((o) => o.enabled && !visible.includes(o));

  if (variant === 'inline') {
    // Dentro del visor del gafete: botones con el estilo de sus acciones (Girar / Descargar), sin tarjeta propia.
    if (usable.length === 0) return null;
    return (
      <>
        {usable.map((o) => (
          <button key={o.id} type="button" className="hc-btn" onClick={() => void go(o.id)} disabled={busy !== null}>
            {busy === o.id ? <Loader2 size={16} className={styles.spin} aria-hidden="true" /> : <Wallet size={16} strokeWidth={2.4} aria-hidden="true" />}{' '}
            {busy === o.id ? 'Preparando…' : o.label}
          </button>
        ))}
        {error && (
          <p className="hc-error" role="alert">
            {error}
          </p>
        )}
      </>
    );
  }

  return (
    <section className={styles.card} aria-label="Credencial digital">
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          <Wallet size={20} strokeWidth={2} />
        </span>
        <div>
          <h2 className={styles.title}>Agregar a Wallet</h2>
          <p className={styles.sub}>Lleva tu credencial en el teléfono, como un boleto. Es personal: no la compartas.</p>
        </div>
      </div>

      {usable.length > 0 ? (
        <div className={styles.actions}>
          {usable.map((o) => (
            <Button key={o.id} block onClick={() => void go(o.id)} disabled={busy !== null}>
              {busy === o.id ? (
                <>
                  <Loader2 size={16} className={styles.spin} aria-hidden="true" /> Preparando…
                </>
              ) : (
                o.label
              )}
            </Button>
          ))}
        </div>
      ) : (
        <p className={styles.note}>
          {platform === 'ios' ? 'Apple Wallet' : 'Google Wallet'} todavía no está disponible para este congreso.
          {other.length > 0 ? ' Puedes abrir esta página desde otro teléfono compatible.' : ''}
        </p>
      )}
      {usable.length > 0 && platform === 'other' && <p className={styles.note}>Para guardarla, abre esta página en tu teléfono o elige la opción que corresponda a él.</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
