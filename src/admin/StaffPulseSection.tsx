import { useCallback, useEffect, useRef, useState } from 'react';
import { QrCode } from 'lucide-react';
import Button from '../components/Button';
import QrScanner from '../components/QrScanner';
import { api } from '../lib/api';
import { parsePulseCode } from '../lib/pulseCode';
import { pulseCodeLabel, type AdminStaffPulseInfo, type StaffPulseLinkResponse } from '../../shared/api';
import s from './Usuarios.module.css';

/**
 * Pulsera de una cuenta del equipo (dentro de "Editar cuenta"). SOLO un Admin llega aquí y el servidor lo vuelve a
 * exigir en cada llamada. Una cuenta tiene a lo más una pulsera; no se le puede dar una que ya sea de un asistente o
 * de otra cuenta. Reemplazar exige el mismo kit y deshabilita la anterior; desvincular la libera (queda deshabilitada).
 */
const MESSAGES: Record<Exclude<StaffPulseLinkResponse['outcome'], 'ok'>, string> = {
  pulse_not_found: 'Esa pulsera no existe.',
  pulse_in_use: 'Esa pulsera ya pertenece a un asistente o está en uso. Usa una pulsera nueva, sin registrar.',
  pulse_linked: 'Esa pulsera ya está asignada a otra cuenta del equipo.',
  pulse_invalidated: 'Esa pulsera está deshabilitada. Usa otra.',
  user_not_found: 'Esa cuenta ya no existe.',
  user_inactive: 'La cuenta está desactivada.',
  user_has_pulse: 'Esta cuenta ya tiene una pulsera. Usa «Reemplazar» para cambiarla.',
  no_link: 'Esta cuenta no tiene pulsera asignada.',
  same_pulse: 'Es la misma pulsera.',
  different_kit: 'La pulsera nueva es de otro kit. Usa una del mismo kit.',
};

export default function StaffPulseSection({ userId, userActive }: { userId: string; userActive: boolean }) {
  const [info, setInfo] = useState<AdminStaffPulseInfo | null>(null);
  const [mode, setMode] = useState<'idle' | 'link' | 'replace'>('idle');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const checking = useRef(false);
  const lastScan = useRef<{ value: string; at: number }>({ value: '', at: 0 }); // el escáner repite el mismo QR varias veces por segundo

  const load = useCallback(() => {
    api
      .adminStaffPulseInfo(userId)
      .then(setInfo)
      .catch((e: Error) => setMsg(e.message));
  }, [userId]);
  useEffect(load, [load]);

  const submit = async (code: string) => {
    setBusy(true);
    setMsg('');
    try {
      const r = mode === 'replace' ? await api.adminReplaceStaffPulse({ userId, code }) : await api.adminLinkStaffPulse({ userId, code });
      if (r.outcome === 'ok') {
        setMode('idle');
        load();
      } else if (r.outcome === 'different_kit') {
        setMsg(`La pulsera nueva es de ${r.newKit} y la actual de ${r.oldKit}. Usa una del mismo kit.`);
      } else {
        setMsg(MESSAGES[r.outcome]);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo completar.');
    } finally {
      setBusy(false);
    }
  };

  /** Una lectura del QR: se consulta la pulsera y se manda su identificador al servidor. */
  const onRead = async (text: string) => {
    if (checking.current || busy) return;
    const parsed = parsePulseCode(text);
    if (!parsed) {
      setMsg('Ese QR no es de una pulsera de Arraigados.');
      return;
    }
    const now = Date.now();
    if (parsed.value === lastScan.current.value && now - lastScan.current.at < 4000) return; // misma lectura: no repetir la consulta
    lastScan.current = { value: parsed.value, at: now };
    checking.current = true;
    try {
      const found = await api.staffPulse(parsed.kind === 'token' ? { token: parsed.value } : { code: parsed.value });
      if (found.status === 'not_found') setMsg('Esa pulsera no existe.');
      else await submit(found.manualCode);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo consultar esa pulsera.');
    } finally {
      checking.current = false;
    }
  };

  const unlink = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await api.adminUnlinkStaffPulse(userId);
      if (r.outcome !== 'ok') setMsg('Esta cuenta ya no tiene pulsera.');
      setConfirmUnlink(false);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo desvincular.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={s.section}>
      <h3 className="label">Pulsera propia</h3>
      {!info ? (
        <p className={s.hint}>Cargando…</p>
      ) : info.linked ? (
        <>
          <p className={s.hint}>
            <strong>{pulseCodeLabel(info.pulseLabel)}</strong> · {info.packageName}
            {info.includedDrinks > 0 ? ` · ${info.drinksUsed} de ${info.includedDrinks} aguas usadas` : ''}
            {info.pulseStatus !== 'ACTIVE' ? ' · deshabilitada' : ''}
          </p>
          {mode === 'idle' && !confirmUnlink && (
            <div className={s.actions}>
              <Button variant="outline" disabled={busy || !userActive} onClick={() => { setMode('replace'); setMsg(''); }}>
                Reemplazar
              </Button>
              <Button variant="outline" className={s.dangerBtn} disabled={busy} onClick={() => setConfirmUnlink(true)}>
                Desvincular
              </Button>
            </div>
          )}
          {confirmUnlink && (
            <>
              <p className={s.hint}>La pulsera quedará deshabilitada y la cuenta sin pulsera. El historial de canjes se conserva.</p>
              <div className={s.actions}>
                <Button variant="outline" onClick={() => setConfirmUnlink(false)} disabled={busy}>
                  Cancelar
                </Button>
                <Button className={s.dangerBtn} onClick={() => void unlink()} disabled={busy}>
                  Confirmar
                </Button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <p className={s.hint}>Esta cuenta no tiene pulsera. Solo un Admin puede asignarla (una sin registrar).</p>
          {mode === 'idle' && (
            <Button variant="outline" disabled={busy || !userActive} onClick={() => { setMode('link'); setMsg(''); }}>
              <QrCode size={15} /> Asignar pulsera
            </Button>
          )}
        </>
      )}

      {mode !== 'idle' && (
        <>
          <p className={s.hint}>{mode === 'replace' ? 'Escanea la pulsera NUEVA (sin registrar, del mismo kit).' : 'Escanea la pulsera sin registrar.'}</p>
          <QrScanner onDecoded={(t) => void onRead(t)} paused={busy} />
          <div className={s.actions}>
            <Button variant="outline" onClick={() => { setMode('idle'); setMsg(''); }} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </>
      )}
      {msg && (
        <p className={s.error} role="alert">
          {msg}
        </p>
      )}
    </section>
  );
}
