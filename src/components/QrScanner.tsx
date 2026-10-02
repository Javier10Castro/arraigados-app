import { useEffect, useId, useRef, useState } from 'react';
import type { Html5Qrcode } from 'html5-qrcode';
import styles from './QrScanner.module.css';

type Props = {
  /** Se llama con el texto crudo del QR. */
  onDecoded: (text: string) => void;
  /** Mientras es true la cámara sigue abierta pero ignora lecturas nuevas. */
  paused?: boolean;
};

/**
 * Cámara + lector de QR (html5-qrcode, la misma librería del /staff del
 * Next.js). Se monta solo cuando el usuario lo pide (tap en "Activar
 * cámara") para que el permiso del navegador aparezca en el momento esperado.
 *
 * Requisito del navegador: la cámara solo funciona en HTTPS o en localhost.
 * Para probar desde un celular en la red local usa `npm run dev:https`.
 */
export default function QrScanner({ onDecoded, paused = false }: Props) {
  const elementId = `qr-${useId().replace(/:/g, '')}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const pausedRef = useRef(paused);
  const onDecodedRef = useRef(onDecoded);
  const [status, setStatus] = useState<'starting' | 'running' | 'error'>('starting');
  const [error, setError] = useState('');

  pausedRef.current = paused;
  onDecodedRef.current = onDecoded;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError('La cámara necesita una conexión segura (https). Abre la app con https para escanear.');
        setStatus('error');
        return;
      }
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
      if (cancelled) return;
      const scanner = new Html5Qrcode(elementId, {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        // Usa el lector nativo del navegador (Chrome/Android, Safari reciente) cuando existe: más rápido y certero.
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      });
      scannerRef.current = scanner;
      try {
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 12,
            // Zona de lectura: 80% del lado menor del video (el QR no tiene que llenar todo).
            qrbox: (w: number, h: number) => {
              const side = Math.floor(Math.min(w, h) * 0.8);
              return { width: side, height: side };
            },
          },
          (text) => {
            if (!pausedRef.current) onDecodedRef.current(text);
          },
          () => {}, // cuadro sin QR: no es error
        );
        if (cancelled) {
          await scanner.stop().catch(() => {});
          return;
        }
        setStatus('running');
      } catch (err) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name ?? String(err);
        setError(
          /NotAllowed|Permission/i.test(name)
            ? 'No diste permiso para usar la cámara. Actívalo en la configuración del navegador e inténtalo de nuevo.'
            : 'No pudimos abrir la cámara. Cierra otras apps que la estén usando e inténtalo de nuevo.',
        );
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner?.isScanning) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {});
      }
    };
  }, [elementId]);

  return (
    <div className={styles.wrap}>
      <div id={elementId} className={styles.reader} />
      {status === 'starting' && <p className={styles.overlay}>Abriendo cámara…</p>}
      {status === 'error' && (
        <p className={`${styles.overlay} ${styles.error}`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
