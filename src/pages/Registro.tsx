import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, ChevronDown } from 'lucide-react';
import Wordmark from '../components/Wordmark';
import RingsMark from '../components/RingsMark';
import Button from '../components/Button';
import Viewfinder from '../components/Viewfinder';
import Ambient from '../components/Ambient';
import QrScanner from '../components/QrScanner';
import { parsePulseCode } from '../lib/pulseCode';
import { api } from '../lib/api';
import { formatPrice } from '../data/app';
import { usePulseSession } from '../context/PulseSession';
import { AGE_RANGES, type PackageSummary } from '../../shared/api';
import type { Church } from '../../shared/churches';
import ChurchCombobox from '../components/ChurchCombobox';
import styles from './Registro.module.css';

/**
 * "Mi registro":
 * - /registro      -> escanear el QR de la pulsera (solo QR: el código manual
 *                     AR26-XXXXX es herramienta exclusiva de Staff).
 * - /p/:token      -> se consulta la pulsera en Neon:
 *                     ACTIVA       -> se guarda en el celular y entra a Inicio
 *                     SIN RECLAMAR -> formulario de registro
 *                     INVALIDADA / NO EXISTE -> aviso para acercarse a Staff
 * Es la misma URL que trae el QR impreso (`{dominio}/p/{token}`).
 */
export default function Registro() {
  const { token } = useParams();
  return token ? <PulseFlow token={token} /> : <ScanStep />;
}

/* ------------------------------------------------------------------ */
/* Marco común                                                          */
/* ------------------------------------------------------------------ */

function Frame({ light = false, onBack, children }: { light?: boolean; onBack: () => void; children: ReactNode }) {
  return (
    <div className={`${styles.screen} ${light ? styles.light : ''}`}>
      <Ambient variant={light ? 'light' : 'dark'} />
      <header className={styles.header}>
        <button type="button" className={styles.back} aria-label="Volver" onClick={onBack}>
          <ArrowLeft size={20} strokeWidth={2.2} />
        </button>
        <div className={styles.brand}>
          <Wordmark className={styles.mark} variant={light ? 'original' : 'cream'} />
          <span className={styles.brandLabel}>Registro</span>
        </div>
        <span className={styles.headerSpacer} />
      </header>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Paso 1: escanear                                                     */
/* ------------------------------------------------------------------ */

function ScanStep() {
  const navigate = useNavigate();
  const { state } = usePulseSession();
  const [cameraOn, setCameraOn] = useState(false);
  const [help, setHelp] = useState(false);
  const [scanError, setScanError] = useState('');
  const handledRef = useRef(false);

  const onDecoded = (text: string) => {
    if (handledRef.current) return;
    const parsed = parsePulseCode(text);
    if (parsed?.kind !== 'token') {
      setScanError('Este QR no es de una pulsera de Arraigados.');
      return;
    }
    handledRef.current = true;
    navigate(`/p/${parsed.value}`);
  };

  return (
    <Frame onBack={() => navigate('/')}>
      <main className={styles.scanBody}>
        {state.phase === 'ready' && (
          <div className={styles.already}>
            <span>Ya tienes una pulsera registrada en este celular.</span>
            <Button size="sm" onClick={() => navigate('/inicio')}>
              Ir a mi inicio
            </Button>
          </div>
        )}

        <Viewfinder className={styles.viewfinder} size="lg">
          {cameraOn ? (
            <QrScanner onDecoded={onDecoded} />
          ) : (
            <button
              type="button"
              className={styles.cameraButton}
              onClick={() => {
                setScanError('');
                setCameraOn(true);
              }}
            >
              <span className={styles.camera}>
                <Camera size={56} strokeWidth={1.4} fill="currentColor" />
              </span>
              <span className={styles.cameraLabel}>Activar cámara</span>
            </button>
          )}
        </Viewfinder>

        <p className={styles.scanText}>
          Escanea el código QR
          <br />
          de tu pulsera para comenzar.
        </p>

        {scanError && (
          <p className={styles.scanError} role="alert">
            {scanError}
          </p>
        )}

        <button type="button" className={styles.help} aria-expanded={help} onClick={() => setHelp((v) => !v)}>
          ¿Problemas para escanear?
        </button>

        {help && (
          <div className={styles.helpBox}>
            <p>
              Revisa que la cámara tenga permiso y que haya buena luz. Si el QR de tu pulsera está dañado,{' '}
              <strong>acércate a un miembro del staff</strong>: ellos pueden encontrar tu pulsera y ayudarte.
            </p>
          </div>
        )}

        <RingsMark className={styles.scanRings} />
      </main>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* /p/:token -> decidir a dónde va                                      */
/* ------------------------------------------------------------------ */

type FlowState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'notice'; title: string; body: string }
  | { kind: 'form'; pkg: PackageSummary };

const NOT_FOUND = {
  title: 'No encontramos esta pulsera',
  body: 'Verifica que estés escaneando el QR de tu pulsera de Arraigados. Si el problema sigue, acércate a un miembro del staff.',
};
const INVALIDATED = {
  title: 'Esta pulsera ya no es válida',
  body: 'Si perdiste tu pulsera y ya te dieron una nueva, escanea la nueva. Si crees que es un error, acércate a un miembro del staff.',
};

function PulseFlow({ token }: { token: string }) {
  const navigate = useNavigate();
  const { setToken } = usePulseSession();
  const [flow, setFlow] = useState<FlowState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFlow({ kind: 'loading' });
    // Solo el token del QR; un código manual aquí no es un acceso válido.
    if (parsePulseCode(token)?.kind !== 'token') {
      setFlow({ kind: 'notice', ...NOT_FOUND });
      return;
    }
    api
      .pulseStatus(token)
      .then((res) => {
        if (cancelled) return;
        if (res.status === 'active') {
          setToken(token);
          navigate('/inicio', { replace: true });
        } else if (res.status === 'unclaimed') {
          setFlow({ kind: 'form', pkg: res.package });
        } else if (res.status === 'invalidated') {
          setFlow({ kind: 'notice', ...INVALIDATED });
        } else {
          setFlow({ kind: 'notice', ...NOT_FOUND });
        }
      })
      .catch((err: Error) => !cancelled && setFlow({ kind: 'error', message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [token, attempt, navigate, setToken]);

  if (flow.kind === 'form') {
    return (
      <RegisterForm
        token={token}
        pkg={flow.pkg}
        onUnavailable={(which) => setFlow({ kind: 'notice', ...(which === 'invalidated' ? INVALIDATED : NOT_FOUND) })}
      />
    );
  }

  return (
    <Frame onBack={() => navigate('/registro')}>
      <main className={styles.scanBody}>
        {flow.kind === 'loading' && <p className={styles.scanText}>Buscando tu pulsera…</p>}
        {flow.kind === 'error' && (
          <div className={styles.notice} role="alert">
            <h1>No pudimos revisar tu pulsera</h1>
            <p>{flow.message}</p>
            <Button block onClick={() => setAttempt((n) => n + 1)}>
              Reintentar
            </Button>
          </div>
        )}
        {flow.kind === 'notice' && (
          <div className={styles.notice} role="alert">
            <h1>{flow.title}</h1>
            <p>{flow.body}</p>
            <Button block variant="outlineLight" onClick={() => navigate('/registro')}>
              Volver a escanear
            </Button>
          </div>
        )}
        <RingsMark className={styles.scanRings} />
      </main>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* Formulario (pulsera sin reclamar)                                     */
/* ------------------------------------------------------------------ */

type Errors = Partial<Record<'nombre' | 'edad' | 'iglesia', string>>;

function RegisterForm({
  token,
  pkg,
  onUnavailable,
}: {
  token: string;
  pkg: PackageSummary;
  onUnavailable: (which: 'invalidated' | 'not_found') => void;
}) {
  const navigate = useNavigate();
  const { setToken } = usePulseSession();
  const [form, setForm] = useState({ nombre: '', edad: '', iglesia: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [churches, setChurches] = useState<Church[] | null>(null);
  const [churchesError, setChurchesError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const loadChurches = () => {
    setChurchesError('');
    api
      .churches()
      .then(setChurches)
      .catch((err: Error) => setChurchesError(err.message));
  };
  useEffect(loadChurches, []);


  const churchesById = useMemo(() => new Map((churches ?? []).map((c) => [c.id, c])), [churches]);

  const submit = async () => {
    const next: Errors = {};
    const nombre = form.nombre.trim();
    if (nombre.length < 2 || nombre.length > 120) next.nombre = 'Escribe tu nombre completo.';
    if (!form.edad) next.edad = 'Selecciona tu rango de edad.';
    if (!churchesById.has(form.iglesia)) next.iglesia = 'Elige tu iglesia de la lista.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await api.claim({ token, fullName: nombre, ageRange: form.edad, churchId: form.iglesia });
      if (res.outcome === 'claimed' || res.outcome === 'already_active') {
        // already_active: otra persona (o un doble toque) la reclamó primero;
        // igual que el Next.js, se manda a la pantalla de la pulsera.
        setToken(token);
        navigate('/inicio', { replace: true });
        return;
      }
      onUnavailable(res.outcome);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No pudimos completar tu registro.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Frame light onBack={() => navigate('/registro')}>
      <main className={styles.formBody}>
        <div className={styles.intro}>
          <h1>¡Bienvenido!</h1>
          <p>Cuéntanos un poco sobre ti para completar tu registro.</p>
          <p className={styles.packageNote}>
            Kit de tu pulsera: <strong>{pkg.name}</strong> · {formatPrice(pkg.price)}
          </p>
        </div>

        <form
          className={styles.fields}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field
            id="nombre"
            label="Nombre completo"
            error={errors.nombre}
            control={
              <input
                id="nombre"
                className={styles.input}
                placeholder="Ej. Juan Pérez"
                value={form.nombre}
                autoComplete="name"
                maxLength={120}
                onChange={(e) => {
                  setForm({ ...form, nombre: e.target.value });
                  setErrors((er) => ({ ...er, nombre: undefined }));
                }}
              />
            }
          />

          <Field
            id="edad"
            label="Edad"
            error={errors.edad}
            control={
              <div className={styles.selectWrap}>
                <select
                  id="edad"
                  className={`${styles.input} ${styles.select}`}
                  value={form.edad}
                  onChange={(e) => {
                    setForm({ ...form, edad: e.target.value });
                    setErrors((er) => ({ ...er, edad: undefined }));
                  }}
                >
                  <option value="">Selecciona tu rango.</option>
                  {AGE_RANGES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <ChevronDown className={styles.selectIcon} size={18} strokeWidth={2.2} />
              </div>
            }
          />

          <Field
            id="iglesia"
            label="Iglesia"
            error={errors.iglesia}
            control={
              churches ? (
                <ChurchCombobox
                  id="iglesia"
                  churches={churches}
                  selectedId={form.iglesia}
                  invalid={Boolean(errors.iglesia)}
                  onSelect={(id) => {
                    setForm((f) => ({ ...f, iglesia: id }));
                    if (id) setErrors((er) => ({ ...er, iglesia: undefined }));
                  }}
                />
              ) : churchesError ? (
                <div className={styles.inlineError}>
                  <span>{churchesError}</span>
                  <button type="button" onClick={loadChurches}>
                    Reintentar
                  </button>
                </div>
              ) : (
                <input id="iglesia" className={`${styles.input} ${styles.locked}`} value="Cargando iglesias…" readOnly />
              )
            }
          />

          {/* Botón dentro del form para que Enter también envíe. */}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>

        {submitError && (
          <p className={styles.error} role="alert">
            {submitError}
          </p>
        )}

        <Button block disabled={submitting || !churches} onClick={() => void submit()}>
          {submitting ? 'Registrando…' : 'Continuar'}
        </Button>
      </main>
    </Frame>
  );
}

function Field({ id, label, control, error }: { id: string; label: string; control: ReactNode; error?: string }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {label}
      </label>
      {control}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
