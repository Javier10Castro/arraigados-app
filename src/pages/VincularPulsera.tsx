import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, QrCode } from 'lucide-react';
import Wordmark from '../components/Wordmark';
import RingsMark from '../components/RingsMark';
import Button from '../components/Button';
import Ambient from '../components/Ambient';
import QrScanner from '../components/QrScanner';
import { homeForRole, useStaffSession } from '../context/StaffSession';
import { useOwnPulseLink } from '../context/useOwnPulseLink';
import { useTeamNav } from '../context/useTeamNav';
import { api } from '../lib/api';
import { parsePulseCode } from '../lib/pulseCode';
import type { StaffPulseLinkResponse } from '../../shared/api';
import styles from './Login.module.css';
import v from './VincularPulsera.module.css';

/**
 * «Vincular pulsera» (cuenta propia de Staff o Admin). Solo refleja lo que decide el servidor:
 *  · Staff NO puede asignarse una pulsera: ve el estado y la indicación de pedir a un Admin que se la asigne en Usuarios.
 *  · Admin ESCANEA (solo QR, sin campo de texto) una pulsera SIN registrar y se vincula con las mismas reglas y la misma ruta
 *    de siempre (POST /api/admin/staff-pulse, solo ADMIN, que rechaza pulseras de asistentes, ya vinculadas o deshabilitadas).
 *  · Vinculada (recién o de antes): estado claro con «Entrar como visitante» (principal) y «Volver a gestión». Aquí no se
 *    reemplaza, desvincula ni reasigna nada (eso sigue en Admin → Usuarios).
 */
const MESSAGES: Record<Exclude<StaffPulseLinkResponse['outcome'], 'ok' | 'different_kit'>, string> = {
  pulse_not_found: 'Esa pulsera no existe. Revisa el QR.',
  pulse_in_use: 'Esa pulsera ya pertenece a un asistente o está en uso. Usa una pulsera nueva, sin registrar.',
  pulse_linked: 'Esa pulsera ya está asignada a otra cuenta del equipo.',
  pulse_invalidated: 'Esa pulsera está deshabilitada. Usa otra.',
  user_not_found: 'Tu cuenta ya no existe.',
  user_inactive: 'Tu cuenta está desactivada.',
  user_has_pulse: 'Tu cuenta ya tiene una pulsera vinculada.',
  no_link: 'Tu cuenta no tiene pulsera vinculada.',
  same_pulse: 'Es la misma pulsera.',
};

export default function VincularPulsera() {
  const navigate = useNavigate();
  const { user } = useStaffSession();
  const link = useOwnPulseLink();
  const isAdmin = user?.role === 'ADMIN';
  const [scanning, setScanning] = useState(false);
  const [justLinked, setJustLinked] = useState(false); // solo cambia el texto: el estado real sale siempre del servidor
  const [entering, setEntering] = useState(false);
  const teamNav = useTeamNav();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const lastScan = useRef<{ value: string; at: number }>({ value: '', at: 0 }); // el escáner repite el mismo QR varias veces por segundo
  const inFlight = useRef(false); // un doble toque / dos lecturas del QR no mandan dos solicitudes

  const submit = async (text: string) => {
    if (!user || inFlight.current) return;
    const parsed = parsePulseCode(text);
    if (!parsed) {
      setMsg('Ese QR no es de una pulsera de Arraigados.');
      return;
    }
    const now = Date.now();
    if (parsed.value === lastScan.current.value && now - lastScan.current.at < 4000) return; // misma lectura: no repetir la consulta
    lastScan.current = { value: parsed.value, at: now };
    inFlight.current = true;
    setBusy(true);
    setMsg('');
    try {
      const found = await api.staffPulse(parsed.kind === 'token' ? { token: parsed.value } : { code: parsed.value });
      if (found.status === 'not_found') {
        setMsg(MESSAGES.pulse_not_found);
        return;
      }
      // La cuenta sale siempre de la sesión; el servidor la revalida y exige rol Admin.
      const r = await api.adminLinkStaffPulse({ userId: user.id, code: found.manualCode });
      if (r.outcome === 'ok') {
        setScanning(false);
        setJustLinked(true);
      } else if (r.outcome !== 'different_kit') {
        setMsg(MESSAGES[r.outcome]);
      }
      link.refresh(); // el estado mostrado sale siempre del servidor, también tras un rechazo (p. ej. «ya vinculada»)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo completar la vinculación.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const goVisitor = async () => {
    if (entering) return;
    setEntering(true);
    try {
      await teamNav.toVisitor(); // la vista sale de la cookie del equipo (GET /api/staff-me); no se pide otro escaneo ni login
    } finally {
      setEntering(false);
    }
  };
  const goManage = () => navigate(user ? homeForRole(user) : '/');
  const manageBtn = (
    <button type="button" className={v.ghost} onClick={goManage}>
      Volver a gestión
    </button>
  );

  return (
    <div className={styles.screen}>
      <Ambient variant="dark" />
      <header className={styles.header}>
        <button type="button" className={styles.back} aria-label="Volver" onClick={() => navigate(user ? homeForRole(user) : '/', { replace: false })}>
          <ArrowLeft size={20} strokeWidth={2.2} />
        </button>
        <div className={styles.brand}>
          <Wordmark className={styles.mark} variant="cream" />
          <span className={styles.brandLabel}>{isAdmin ? 'Admin' : 'Staff'}</span>
        </div>
        <span className={styles.spacer} />
      </header>

      <main className={styles.body}>
        <div className={styles.intro}>
          <h1>Vincular pulsera</h1>
          <p>Tu pulsera personal permite ver tu experiencia de visitante y, si el equipo lo autoriza, autocanjear tus bebidas.</p>
        </div>

        {link.phase === 'loading' && (
          <section className={v.card} aria-busy="true">
            <p>Consultando tu pulsera…</p>
          </section>
        )}

        {link.phase === 'error' && (
          <section className={`${v.card} ${v.warn}`} role="alert">
            <h2>No pudimos consultar tu pulsera</h2>
            <p>{link.message}</p>
            <button type="button" className={v.ghost} onClick={link.refresh}>
              Reintentar
            </button>
          </section>
        )}

        {link.phase === 'linked' && (
          <section className={`${v.card} ${v.ok}`} aria-live="polite">
            <div className={v.okHead}>
              <span className={v.okIcon}>
                <Check size={18} strokeWidth={3} aria-hidden="true" />
              </span>
              <h2>Pulsera vinculada</h2>
            </div>
            <p>
              {justLinked ? 'Listo: la pulsera quedó vinculada a tu cuenta' : 'Tu cuenta ya tiene su pulsera'} ({link.packageName}
              {link.includedDrinks > 0 ? ` · te quedan ${link.drinksRemaining} de ${link.includedDrinks} aguas` : ''}). No necesitas
              escanear otra.
            </p>
            <div className={v.actions}>
              <Button onClick={() => void goVisitor()} disabled={entering}>
                {entering ? 'Entrando…' : 'Entrar como visitante'}
              </Button>
              {manageBtn}
            </div>
            <p>Si hay que cambiarla, un Admin lo hace desde Usuarios.</p>
          </section>
        )}

        {link.phase === 'disabled' && (
          <section className={`${v.card} ${v.warn}`}>
            <h2>Tu pulsera está deshabilitada</h2>
            <p>Pide a un Admin que revise tu cuenta en el panel de Usuarios. Desde aquí no se puede cambiar.</p>
            <button type="button" className={v.ghost} onClick={link.refresh}>
              Volver a consultar
            </button>
            {manageBtn}
          </section>
        )}

        {link.phase === 'pending' && !isAdmin && (
          <section className={`${v.card} ${v.warn}`}>
            <h2>Configuración pendiente</h2>
            <p>
              Una cuenta Staff no puede asignarse una pulsera por sí misma. Pide a un Admin que te la asigne desde el panel de Usuarios
              (Editar cuenta → Pulsera propia).
            </p>
            <p>Cuando te la asignen, esta opción aparecerá como «Pulsera vinculada».</p>
            <button type="button" className={v.ghost} onClick={link.refresh}>
              Volver a consultar
            </button>
            {manageBtn}
          </section>
        )}

        {link.phase === 'pending' && isAdmin && (
          <section className={`${v.card} ${v.warn}`}>
            <h2>Configuración pendiente</h2>
            <p>Escanea el QR de una pulsera sin registrar (nueva, que no sea de un asistente) para vincularla a tu cuenta.</p>
            {!scanning ? (
              <Button onClick={() => { setScanning(true); setMsg(''); }} disabled={busy}>
                <QrCode size={15} /> Vincular mi pulsera
              </Button>
            ) : (
              <div className={v.actions}>
                <QrScanner onDecoded={(t) => void submit(t)} paused={busy} />
                {busy && <p>Vinculando…</p>}
                <button type="button" className={v.ghost} disabled={busy} onClick={() => { setScanning(false); setMsg(''); }}>
                  Cancelar
                </button>
              </div>
            )}
            {msg && (
              <p className={v.error} role="alert">
                {msg}
              </p>
            )}
          </section>
        )}

        <div className={styles.footer}>
          <RingsMark className={styles.rings} />
        </div>
      </main>
    </div>
  );
}
