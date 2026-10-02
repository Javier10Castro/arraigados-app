import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, KeyRound, LogOut, QrCode, Search } from 'lucide-react';
import Wordmark from '../components/Wordmark';
import RingsMark from '../components/RingsMark';
import Button from '../components/Button';
import Viewfinder from '../components/Viewfinder';
import Ambient from '../components/Ambient';
import QrScanner from '../components/QrScanner';
import ChurchCombobox from '../components/ChurchCombobox';
import RedeemModal, { type PulseRef } from '../components/RedeemModal';
import { parsePulseCode } from '../lib/pulseCode';
import { api } from '../lib/api';
import { useStaffSession } from '../context/StaffSession';
import type { Church } from '../../shared/churches';
import { pulseCodeLabel, type StaffHistoryRow, type StaffSearchResult } from '../../shared/api';
import { shortDate } from '../admin/format';
import styles from './Staff.module.css';

/**
 * Botón "Código AR26" (ícono de llave) para escribir a mano el código de la pulsera.
 * Oculto desde el 1 oct 2026: por ahora no se usará. El código sigue completo;
 * para volver a mostrarlo basta con poner true. Ver docs/CAMBIOS_UI.md.
 */
const SHOW_MANUAL_CODE = false;

/**
 * Staff (requiere sesión de STAFF o ADMIN):
 * - Escanear el QR de la pulsera -> modal de canje.
 * - Si el QR no se puede escanear: buscar por nombre y/o iglesia (muestra el
 *   código AR26-XXXXX) -> mismo modal. Escribir el código a mano está oculto
 *   (SHOW_MANUAL_CODE).
 * El código manual es herramienta exclusiva de Staff.
 */
export default function Staff() {
  const navigate = useNavigate();
  const { user, signOut } = useStaffSession();
  const [cameraOn, setCameraOn] = useState(false);
  const [panel, setPanel] = useState<'none' | 'search' | 'code'>('none');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState<PulseRef | null>(null);
  // El modal pide la cámara al reemplazar una pulsera: la de la pantalla se apaga mientras.
  const [cameraLent, setCameraLent] = useState(false);
  // Evita reabrir el modal con la misma pulsera que sigue frente a la cámara justo al cerrarlo.
  const lastScan = useRef<{ value: string; at: number }>({ value: '', at: 0 });

  // Etapa 3: "Mis canjes recientes" -- solo los del Staff de la sesión (el id
  // sale del servidor, ver server/staff.ts#staffHistory). Se recarga sola
  // tras un canje exitoso (onRedeemed del modal), sin recargar la página.
  const [history, setHistory] = useState<StaffHistoryRow[] | null>(null);
  const loadHistory = useCallback(() => {
    api
      .staffHistory()
      .then((r) => setHistory(r.rows))
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onDecoded = (text: string) => {
    if (open) return;
    const parsed = parsePulseCode(text);
    if (!parsed) {
      setError('Este QR no es de una pulsera de Arraigados.');
      return;
    }
    const now = Date.now();
    if (parsed.value === lastScan.current.value && now - lastScan.current.at < 3000) return;
    lastScan.current = { value: parsed.value, at: now };
    setError('');
    setOpen(parsed.kind === 'token' ? { token: parsed.value } : { code: parsed.value });
  };

  const closeModal = useCallback(() => {
    lastScan.current.at = Date.now();
    setOpen(null);
  }, []);

  const submitCode = () => {
    const parsed = parsePulseCode(code);
    if (parsed?.kind !== 'manual') {
      setError('El código debe verse como AR26-X7K9P.');
      return;
    }
    setError('');
    setOpen({ code: parsed.value });
  };

  return (
    <div className={styles.screen}>
      <Ambient variant="dark" />

      <header className={styles.header}>
        {user?.role === 'ADMIN' ? (
          <button type="button" className={styles.back} aria-label="Volver al panel de Admin" title="Panel Admin" onClick={() => navigate('/admin')}>
            <ArrowLeft size={20} strokeWidth={2.2} />
          </button>
        ) : (
          <span className={styles.spacer} />
        )}
        <div className={styles.headerCenter}>
          <h1 className={styles.title}>Staff</h1>
          {user && <span className={styles.who}>{user.name}</span>}
        </div>
        <button
          type="button"
          className={styles.back}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          onClick={() => void signOut().then(() => navigate('/login', { replace: true }))}
        >
          <LogOut size={19} strokeWidth={2.2} />
        </button>
      </header>

      <main className={styles.body}>
        <p className={styles.heading}>Escanear asistente</p>

        <div className={styles.scanCard}>
          <Viewfinder className={styles.viewfinder} size="md">
            {cameraOn && cameraLent ? (
              <p className={styles.hint}>Cámara en uso para reemplazar pulsera…</p>
            ) : cameraOn ? (
              <QrScanner paused={open !== null} onDecoded={onDecoded} />
            ) : (
              <button type="button" className={styles.cameraButton} onClick={() => setCameraOn(true)}>
                <QrCode size={64} strokeWidth={1.4} />
                <span>Activar cámara</span>
              </button>
            )}
          </Viewfinder>
          <p className={styles.hint}>
            Apunta el código QR
            <br />
            de la pulsera
          </p>
        </div>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.tools}>
          <button
            type="button"
            className={`${styles.tool} ${panel === 'search' ? styles.toolActive : ''}`}
            aria-expanded={panel === 'search'}
            onClick={() => setPanel(panel === 'search' ? 'none' : 'search')}
          >
            <Search size={17} strokeWidth={2.2} />
            Buscar
          </button>
          {SHOW_MANUAL_CODE && (
          <button
            type="button"
            className={`${styles.tool} ${panel === 'code' ? styles.toolActive : ''}`}
            aria-expanded={panel === 'code'}
            onClick={() => setPanel(panel === 'code' ? 'none' : 'code')}
          >
            <KeyRound size={17} strokeWidth={2.2} />
            Código AR26
          </button>
          )}
        </div>

        {SHOW_MANUAL_CODE && panel === 'code' && (
          <form
            className={styles.manual}
            onSubmit={(e) => {
              e.preventDefault();
              submitCode();
            }}
          >
            <label className={styles.manualLabel} htmlFor="staff-code">
              Código de la pulsera
            </label>
            <input
              id="staff-code"
              className={styles.manualInput}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError('');
              }}
              placeholder="Ej. AR26-X7K9P"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
            <Button type="submit" block disabled={parsePulseCode(code)?.kind !== 'manual'}>
              Abrir pulsera
            </Button>
          </form>
        )}

        {panel === 'search' && <SearchPanel onOpen={(c) => setOpen({ code: c })} />}

        <section className={styles.history} aria-label="Mis canjes recientes">
          <h2 className={styles.historyTitle}>Mis canjes recientes</h2>
          {history === null ? (
            <p className={styles.historyEmpty}>Cargando…</p>
          ) : history.length === 0 ? (
            <p className={styles.historyEmpty}>Todavía no has hecho ningún canje.</p>
          ) : (
            <ul className={styles.historyList}>
              {history.map((h) => (
                <li key={h.id} className={styles.historyItem}>
                  <div className={styles.historyMain}>
                    <strong>{h.attendeeName}</strong>
                    <span className={h.status === 'ANULADO' ? styles.historyVoid : undefined}>
                      {h.pulseLabel} · {h.quantity} agua{h.quantity === 1 ? '' : 's'} fresca{h.quantity === 1 ? '' : 's'}
                      {h.status === 'ANULADO' ? ' · Anulado por Admin' : ''}
                    </span>
                  </div>
                  <span className={styles.historyWhen}>{shortDate(h.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <button type="button" className={styles.account} onClick={() => navigate('/cuenta/contrasena')}>
          Cambiar mi contraseña
        </button>

        <div className={styles.footer}>
          <Wordmark className={styles.mark} variant="cream" />
          <RingsMark className={styles.rings} />
        </div>
      </main>

      {open && <RedeemModal pulse={open} onClose={closeModal} onCameraNeeded={setCameraLent} onRedeemed={loadHistory} />}
    </div>
  );
}

/** Búsqueda por nombre y/o iglesia (solo pulseras activas). */
function SearchPanel({ onOpen }: { onOpen: (manualCode: string) => void }) {
  const [q, setQ] = useState('');
  const [churchId, setChurchId] = useState('');
  const [churches, setChurches] = useState<Church[] | null>(null);
  const [results, setResults] = useState<StaffSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .churches()
      .then(setChurches)
      .catch(() => setChurches([]));
  }, []);

  // Búsqueda con una pequeña espera mientras se escribe.
  useEffect(() => {
    const name = q.trim();
    if (name.length < 2 && !churchId) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(() => {
      api
        .staffSearch(name, churchId)
        .then((r) => {
          if (cancelled) return;
          setResults(r);
          setError('');
        })
        .catch((err: Error) => !cancelled && setError(err.message))
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q, churchId]);

  return (
    <section className={styles.search} aria-label="Buscar asistente">
      <label className={styles.searchLabel} htmlFor="staff-q">
        Nombre
      </label>
      <input
        id="staff-q"
        className={styles.searchInput}
        placeholder="Ej. María"
        value={q}
        autoComplete="off"
        onChange={(e) => setQ(e.target.value)}
      />
      <label className={styles.searchLabel} htmlFor="staff-church">
        Iglesia (opcional)
      </label>
      {churches ? (
        <ChurchCombobox
          id="staff-church"
          churches={churches}
          selectedId={churchId}
          onSelect={setChurchId}
          placeholder="Cualquier iglesia"
        />
      ) : (
        <input className={styles.searchInput} value="Cargando iglesias…" readOnly />
      )}

      <div className={styles.results} aria-live="polite">
        {error && <p className={styles.searchMsg}>{error}</p>}
        {!error && results === null && <p className={styles.searchMsg}>Escribe al menos 2 letras del nombre o elige una iglesia.</p>}
        {!error && loading && results === null && <p className={styles.searchMsg}>Buscando…</p>}
        {!error && results?.length === 0 && <p className={styles.searchMsg}>Sin resultados con pulsera activa.</p>}
        {results && results.length > 0 && (
          <ul className={styles.resultList}>
            {results.map((r) => (
              <li key={r.manualCode}>
                <button type="button" className={styles.result} onClick={() => onOpen(r.manualCode)}>
                  <span className={styles.resultBody}>
                    <strong>{r.fullName}</strong>
                    <span>{r.churchName}</span>
                    <span className={styles.resultMeta}>
                      <b>{pulseCodeLabel(r.manualCode)}</b> · {r.packageName}
                      {r.includedDrinks > 0 ? ` · ${r.drinksRemaining}/${r.includedDrinks} aguas` : ''}
                    </span>
                  </span>
                  <ChevronRight size={18} strokeWidth={2.2} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
