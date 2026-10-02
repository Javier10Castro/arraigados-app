import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, RefreshCw, X } from 'lucide-react';
import Button from './Button';
import DrinkCups from './DrinkCups';
import QrScanner from './QrScanner';
import { api } from '../lib/api';
import { parsePulseCode } from '../lib/pulseCode';
import { pulseCodeLabel, type StaffPulseResponse } from '../../shared/api';
import styles from './RedeemModal.module.css';

export type PulseRef = { token: string } | { code: string };

/** Llave única por apertura del modal (no por clic): reintentos y doble toque nunca descuentan dos veces. */
function newIdempotencyKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes); // disponible también fuera de https (a diferencia de randomUUID)
  return 'vite-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const AUTO_CLOSE_MS = 2000;

/**
 * Modal de canje de Staff:
 * - Muestra al asistente (nombre, iglesia · presbiterio · zona), su paquete,
 *   su código de respaldo y las aguas frescas como vasos (sólido = disponible,
 *   punteado = canjeada).
 * - "Aceptar" descuenta EXACTAMENTE 1. Al confirmarse, el vaso pasa a punteado
 *   y el modal se cierra solo a los 2 s (decisión: opción A).
 * - Sin aguas en el kit (Kit - A) o sin saldo: lo dice y no hay Aceptar.
 * - "Reemplazar pulsera" (pulsera perdida o dañada): Staff escanea una pulsera
 *   NUEVA sin reclamar del mismo kit; la actual queda Deshabilitada y la nueva
 *   activa para el mismo asistente, con las aguas ya canjeadas descontadas.
 *   Mientras se escanea la nueva, la cámara de la pantalla de Staff se apaga
 *   (`onCameraNeeded`) para no tener dos cámaras abiertas.
 */
type ReplaceStep =
  | { step: 'scan'; error?: string }
  | { step: 'confirm'; newToken: string; newLabel: string; error?: string }
  | { step: 'done'; newLabel: string; drinksUsed: number; drinksRemaining: number };

export default function RedeemModal({
  pulse,
  onClose,
  onCameraNeeded,
  onRedeemed,
}: {
  pulse: PulseRef;
  onClose: () => void;
  /** true mientras el modal usa la cámara (escaneo de la pulsera nueva). */
  onCameraNeeded?: (needed: boolean) => void;
  /** Se llama tras un canje exitoso (incluido "ya estaba registrada"), para refrescar el historial de Staff. */
  onRedeemed?: () => void;
}) {
  const [info, setInfo] = useState<StaffPulseResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [done, setDone] = useState<{ remaining: number; repeated: boolean } | null>(null);
  const keyRef = useRef(newIdempotencyKey());
  const [replace, setReplace] = useState<ReplaceStep | null>(null);
  const [replacing, setReplacing] = useState(false);
  // La cámara del modal arranca un instante después de apagar la de la pantalla.
  const [scannerReady, setScannerReady] = useState(false);
  const checkingRef = useRef(false);

  const scanning = replace?.step === 'scan';
  useEffect(() => {
    onCameraNeeded?.(scanning);
    if (!scanning) {
      setScannerReady(false);
      return;
    }
    const t = window.setTimeout(() => setScannerReady(true), 350);
    return () => window.clearTimeout(t);
  }, [scanning, onCameraNeeded]);
  useEffect(() => () => onCameraNeeded?.(false), [onCameraNeeded]);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .staffPulse(pulse)
      .then((r) => !cancelled && setInfo(r))
      .catch((err: Error) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [pulse]);

  // Cierre automático tras un canje confirmado.
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(onClose, AUTO_CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [done, onClose]);

  // Escape cierra (si no hay un envío en curso); el foco entra al modal.
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !sending && !replacing && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sending, replacing]);

  /** Lectura de la pulsera NUEVA. */
  const onNewScan = async (text: string) => {
    if (info?.status !== 'active' || checkingRef.current) return;
    const parsed = parsePulseCode(text);
    if (parsed?.kind !== 'token') {
      setReplace({ step: 'scan', error: 'Ese QR no es de una pulsera de Arraigados.' });
      return;
    }
    checkingRef.current = true;
    try {
      const next = await api.staffPulse({ token: parsed.value });
      if (next.status === 'not_found') {
        setReplace({ step: 'scan', error: 'Esa pulsera no existe. Escanea otra.' });
      } else if (next.status === 'active') {
        setReplace({ step: 'scan', error: 'Esa pulsera ya es de alguien. Usa una pulsera nueva, sin registrar.' });
      } else if (next.status === 'invalidated') {
        setReplace({ step: 'scan', error: 'Esa pulsera está deshabilitada. Usa otra.' });
      } else if (next.manualCode === info.manualCode) {
        setReplace({ step: 'scan', error: 'Es la misma pulsera. Escanea la nueva.' });
      } else if (next.packageName !== info.package.name) {
        setReplace({
          step: 'scan',
          error: `Esa pulsera es de ${next.packageName} y la de ${info.attendee.fullName} es de ${info.package.name}. Usa una del mismo kit.`,
        });
      } else {
        setReplace({ step: 'confirm', newToken: parsed.value, newLabel: pulseCodeLabel(next.manualCode) });
      }
    } catch (err) {
      setReplace({ step: 'scan', error: err instanceof Error ? err.message : 'No se pudo consultar esa pulsera.' });
    } finally {
      checkingRef.current = false;
    }
  };

  const confirmReplace = async () => {
    if (info?.status !== 'active' || replace?.step !== 'confirm' || replacing) return;
    setReplacing(true);
    try {
      const res = await api.reassign({ manualCode: info.manualCode, newToken: replace.newToken });
      if (res.outcome === 'ok') {
        setReplace({ step: 'done', newLabel: pulseCodeLabel(res.newCode), drinksUsed: res.drinksUsed, drinksRemaining: res.drinksRemaining });
      } else {
        const msg: Record<Exclude<typeof res.outcome, 'ok'>, string> = {
          old_not_active: 'La pulsera actual ya no está activa (¿alguien la reemplazó?). Cierra y vuelve a buscar al asistente.',
          new_not_found: 'La pulsera nueva no existe.',
          new_not_available: 'La pulsera nueva ya fue registrada por alguien más. Escanea otra.',
          same_pulse: 'Es la misma pulsera.',
          different_kit: 'La pulsera nueva es de otro kit. Usa una del mismo kit.',
        };
        setReplace({ ...replace, error: msg[res.outcome] });
      }
    } catch (err) {
      setReplace({ ...replace, error: (err instanceof Error ? err.message : 'No se pudo reemplazar.') + ' Puedes reintentar.' });
    } finally {
      setReplacing(false);
    }
  };

  const accept = async () => {
    if (info?.status !== 'active' || sending) return;
    setSending(true);
    setSendError('');
    try {
      const res = await api.redeem({ manualCode: info.manualCode, idempotencyKey: keyRef.current });
      if (res.outcome === 'ok' || res.outcome === 'already_processed') {
        setInfo({ ...info, drinksUsed: info.package.includedDrinks - res.drinksRemaining, drinksRemaining: res.drinksRemaining });
        setDone({ remaining: res.drinksRemaining, repeated: res.outcome === 'already_processed' });
        onRedeemed?.();
      } else if (res.outcome === 'insufficient_balance') {
        setInfo({ ...info, drinksUsed: info.package.includedDrinks - res.drinksRemaining, drinksRemaining: res.drinksRemaining });
        setSendError('Ya no le quedan aguas frescas (alguien más acaba de canjear).');
      } else {
        setSendError('Esta pulsera ya no está activa. No se descontó nada.');
      }
    } catch (err) {
      // Mismo idempotencyKey en el reintento: si el primero sí llegó, no se descuenta otra vez.
      setSendError((err instanceof Error ? err.message : 'No se pudo canjear.') + ' Puedes reintentar sin riesgo.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={() => !sending && !done && !replace && onClose()}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="redeem-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.close} aria-label="Cerrar" onClick={onClose} disabled={sending || replacing}>
          <X size={18} strokeWidth={2.4} />
        </button>

        {!info && !loadError && <p className={styles.muted}>Buscando pulsera…</p>}
        {loadError && <Notice title="No pudimos consultar la pulsera" body={loadError} onClose={onClose} />}

        {info?.status === 'not_found' && (
          <Notice title="Pulsera no encontrada" body="Ese QR o código no corresponde a ninguna pulsera." onClose={onClose} />
        )}
        {info?.status === 'invalidated' && (
          <Notice
            title="Pulsera deshabilitada"
            body={`La pulsera ${pulseCodeLabel(info.manualCode)} fue reemplazada por otra. Ya no sirve para entrar ni para canjear.`}
            onClose={onClose}
          />
        )}
        {info?.status === 'unclaimed' && (
          <Notice
            title="Pulsera sin registrar"
            body={`La pulsera ${pulseCodeLabel(info.manualCode)} (${info.packageName}) todavía no tiene asistente. Pídele que la escanee con su celular para registrarse.`}
            onClose={onClose}
          />
        )}

        {info?.status === 'active' && replace && (
          <div className={styles.replace}>
            <span className={styles.badge}>{info.package.name}</span>
            <h2 id="redeem-title" className={styles.name}>
              {replace.step === 'done' ? 'Pulsera reemplazada' : 'Reemplazar pulsera'}
            </h2>
            <p className={styles.church}>{info.attendee.fullName}</p>

            {replace.step === 'scan' && (
              <>
                <p className={styles.replaceHint}>
                  Escanea la pulsera <strong>nueva</strong> (sin registrar, de {info.package.name}).
                </p>
                <div className={styles.replaceCam}>
                  {scannerReady ? (
                    <QrScanner onDecoded={(text) => void onNewScan(text)} />
                  ) : (
                    <p className={styles.muted}>Abriendo cámara…</p>
                  )}
                </div>
                {replace.error && (
                  <p className={styles.error} role="alert">
                    {replace.error}
                  </p>
                )}
                <div className={styles.actions}>
                  <Button variant="outline" onClick={() => setReplace(null)}>
                    Cancelar
                  </Button>
                </div>
              </>
            )}

            {replace.step === 'confirm' && (
              <>
                <div className={styles.swap}>
                  <div>
                    <span>Actual</span>
                    <strong>{pulseCodeLabel(info.manualCode)}</strong>
                    <em className={styles.swapOff}>Quedará deshabilitada</em>
                  </div>
                  <ArrowRight size={20} aria-hidden="true" />
                  <div>
                    <span>Nueva</span>
                    <strong>{replace.newLabel}</strong>
                    <em className={styles.swapOn}>Queda activa</em>
                  </div>
                </div>
                {info.package.includedDrinks > 0 && (
                  <p className={styles.replaceHint}>
                    Aguas frescas: ya usó <strong>{info.drinksUsed}</strong> de {info.package.includedDrinks}. En la pulsera
                    nueva le quedan <strong>{info.drinksRemaining}</strong>.
                  </p>
                )}
                {replace.error && (
                  <p className={styles.error} role="alert">
                    {replace.error}
                  </p>
                )}
                <div className={styles.actions}>
                  <Button variant="outline" onClick={() => setReplace({ step: 'scan' })} disabled={replacing}>
                    Atrás
                  </Button>
                  <Button onClick={() => void confirmReplace()} disabled={replacing}>
                    {replacing ? 'Reemplazando…' : 'Confirmar'}
                  </Button>
                </div>
              </>
            )}

            {replace.step === 'done' && (
              <>
                <p className={styles.success} role="status">
                  <CheckCircle2 size={20} strokeWidth={2.4} />
                  Listo. Ahora usa la pulsera {replace.newLabel}
                </p>
                <p className={styles.replaceHint}>
                  La anterior quedó deshabilitada: ya no sirve para entrar ni para canjear.
                  {info.package.includedDrinks > 0 &&
                    ` Le quedan ${replace.drinksRemaining} de ${info.package.includedDrinks} aguas frescas.`}
                </p>
                <div className={styles.actions}>
                  <Button onClick={onClose}>Cerrar</Button>
                </div>
              </>
            )}
          </div>
        )}

        {info?.status === 'active' && !replace && (
          <>
            <div className={styles.top}>
              <span className={styles.badge}>{info.package.name}</span>
              <span className={styles.code}>{pulseCodeLabel(info.manualCode)}</span>
            </div>
            <h2 id="redeem-title" className={styles.name}>
              {info.attendee.fullName}
            </h2>
            <p className={styles.church}>
              {info.attendee.churchName}
              <br />
              <span>
                {info.attendee.presbyteryName} · {info.attendee.zoneName}
              </span>
            </p>

            <div className={styles.drinks}>
              {info.package.includedDrinks > 0 ? (
                <>
                  <DrinkCups total={info.package.includedDrinks} used={info.drinksUsed} size={38} />
                  <p className={styles.count}>
                    <strong>{info.drinksRemaining}</strong> de {info.package.includedDrinks} aguas frescas disponibles
                  </p>
                </>
              ) : (
                <p className={styles.warn}>Su kit no incluye aguas frescas.</p>
              )}
            </div>

            {done ? (
              <p className={styles.success} role="status">
                <CheckCircle2 size={20} strokeWidth={2.4} />
                {done.repeated ? 'Ya estaba registrada (no se descontó dos veces).' : 'Agua fresca entregada.'}
              </p>
            ) : (
              <>
                {sendError && (
                  <p className={styles.error} role="alert">
                    {sendError}
                  </p>
                )}
                {info.package.includedDrinks > 0 && info.drinksRemaining === 0 && !sendError && (
                  <p className={styles.warn}>Ya canjeó todas sus aguas frescas.</p>
                )}
                <div className={styles.actions}>
                  <Button variant="outline" onClick={onClose} disabled={sending}>
                    {info.drinksRemaining > 0 ? 'Cancelar' : 'Cerrar'}
                  </Button>
                  {info.drinksRemaining > 0 && (
                    <Button onClick={() => void accept()} disabled={sending}>
                      {sending ? 'Descontando…' : 'Aceptar'}
                    </Button>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.replaceLink}
                  onClick={() => setReplace({ step: 'scan' })}
                  disabled={sending}
                >
                  <RefreshCw size={14} strokeWidth={2.4} /> Reemplazar pulsera (perdida o dañada)
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Notice({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  return (
    <div className={styles.notice} role="alert">
      <h2 id="redeem-title">{title}</h2>
      <p>{body}</p>
      <Button block variant="outline" onClick={onClose}>
        Cerrar
      </Button>
    </div>
  );
}
