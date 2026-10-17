import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, RotateCw, X } from 'lucide-react';
import HangingBadge, { type PhysicsParams } from './hanging/HangingBadge';
import CredentialCard from './credential/CredentialCard';
import CredentialSheet, { SHEET_H, SHEET_W } from './credential/CredentialSheet';
import { downloadBlob, nodeToPngBlob } from './exportCredential';
import useReducedMotion from './useReducedMotion';
import { brandTheme } from './brand';
import type { CredentialBadge } from './credentialData';
import './homev2.css';
import './overlay.css';

/* Secuencia automática (ms), ~13.4 s: caída + frente, giro, reverso y cierre. */
const FRONT_HOLD_MS = 5200;
const FLIP_MS = 1150;
const BACK_HOLD_MS = 7000;
/* Con movimiento reducido la secuencia se acorta. */
const FRONT_HOLD_MS_CALM = 2200;
const FLIP_MS_CALM = 240;
const BACK_HOLD_MS_CALM = 2600;

/* Caída: se suelta el péndulo a ~26° con velocidad angular 0; la gravedad lo acerca al centro y el
   amortiguamiento disipa la oscilación en ~2 s. */
const DROP_ANGLE_RAD = 0.2; // más suave que la versión de /try (0.46): se alcanza a leer
const DROP_RADIAL_VELOCITY = 90;
const DROP_RADIAL_DAMPING = 0.94; // el rebote vertical se apaga rápido

const ANCHOR_Y = 58;
const CHROME_RESERVED = 96;

type Props = {
  badge: CredentialBadge;
  /** `intro`: secuencia automática con "Omitir". `viewer`: "Mi gafete", sin temporizadores, con girar/descargar/cerrar. */
  mode?: 'intro' | 'viewer';
  /** true mientras la capa se desvanece (el padre la desmonta al terminar). */
  leaving: boolean;
  /** Terminó la secuencia o la persona pulsó "Omitir". */
  onFinish: () => void;
};

/**
 * Animación de entrada de /homev2 (portada de HangingCards /try): el gafete de la persona cae, muestra el
 * frente, gira y enseña el reverso; al terminar llama `onFinish`. No hay pantalla de bienvenida intermedia:
 * lo que sigue es el Home. "Omitir" la corta en cualquier momento.
 */
export default function IntroExperience({ badge, mode = 'intro', leaving, onFinish }: Props) {
  const isViewer = mode === 'viewer';
  const reducedMotion = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const [isTurning, setIsTurning] = useState(false);
  const [dimensions, setDimensions] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  useEffect(() => {
    const onResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* Referencia estable: HangingBadge la tiene en las dependencias de su bucle de animación. */
  const physicsParams = useMemo<PhysicsParams>(
    () =>
      reducedMotion || isViewer
        ? { gravity: 0.5, damping: 0.995, stiffness: 0, wind: 0 }
        : { gravity: 0.5, damping: 0.995, stiffness: 0, wind: 0.12 }, // intro: casi sin viento, oscilación corta
    [reducedMotion, isViewer],
  );

  const flipMs = reducedMotion ? FLIP_MS_CALM : FLIP_MS;
  const frontHoldMs = reducedMotion ? FRONT_HOLD_MS_CALM : FRONT_HOLD_MS;
  const backHoldMs = reducedMotion ? BACK_HOLD_MS_CALM : BACK_HOLD_MS;

  /* Los temporizadores salen de un solo efecto: una cancelación (desmontaje, "Omitir") los limpia a todos. */
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  useEffect(() => {
    if (leaving || isViewer) return undefined;
    const timers = [
      setTimeout(() => {
        setIsTurning(true);
        setFlipped(true);
      }, frontHoldMs),
      setTimeout(() => setIsTurning(false), frontHoldMs + flipMs),
      setTimeout(() => finishRef.current(), frontHoldMs + flipMs + backHoldMs),
    ];
    return () => timers.forEach(clearTimeout);
  }, [leaving, isViewer, frontHoldMs, flipMs, backHoldMs]);

  /* Escape cierra/omite en ambos modos. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finishRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* Descarga: se dibuja una copia plana (frente + reverso) fuera de pantalla y se convierte a PNG. */
  const sheetRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const download = async () => {
    const node = sheetRef.current?.firstElementChild as HTMLElement | null;
    if (!node || downloading) return;
    setDownloading(true);
    setDownloadError('');
    try {
      const blob = await nodeToPngBlob(node, SHEET_W, SHEET_H, 3);
      downloadBlob(blob, `gafete-arraigados-2k26.png`);
    } catch {
      setDownloadError('No se pudo crear la imagen. Prueba de nuevo o desde otro navegador.');
    } finally {
      setDownloading(false);
    }
  };

  const { cardWidth, cardHeight, anchorX } = useMemo(() => {
    const availableHeight = dimensions.height - ANCHOR_Y - CHROME_RESERVED;
    const availableWidth = dimensions.width - 40;
    const scale = Math.max(0.72, Math.min(1, availableHeight / 400, availableWidth / 260));
    return { cardWidth: Math.round(260 * scale), cardHeight: Math.round(400 * scale), anchorX: dimensions.width / 2 };
  }, [dimensions]);

  /* Doble clic/toque sobre la tarjeta la gira: gesto heredado del estudio. */
  const turnTimer = useRef<number>(0);
  const toggleFlip = () => {
    setIsTurning(true);
    setFlipped((v) => !v);
    window.clearTimeout(turnTimer.current);
    turnTimer.current = window.setTimeout(() => setIsTurning(false), flipMs);
  };
  useEffect(() => () => window.clearTimeout(turnTimer.current), []);

  /* Portal a <body>: la capa queda por encima de la barra/menú de la app sin depender de su apilamiento. */
  return createPortal(
    <div
      className={`hc hc-overlay app-canvas try-view brand-congreso theme-light${leaving ? ' is-leaving' : ''}`}
      style={brandTheme}
      role="dialog"
      aria-modal="true"
      aria-label="Tu gafete de Arraigados 2K26"
    >
      <div className="studio-background">
        <div className="studio-spotlight spotlight-main" />
        <div className="studio-spotlight spotlight-fill" />
        <div className="studio-vignette" />
      </div>

      <div className="try-stage" id="hc-stage">
        <HangingBadge
          badge={badge}
          anchorX={anchorX}
          anchorY={ANCHOR_Y}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          physicsParams={physicsParams}
          cardComponent={CredentialCard}
          isFlipped={flipped}
          isTurning={isTurning}
          onToggleFlip={toggleFlip}
          /* "Mi gafete" (visor) arranca QUIETO y recto: la persona lo mueve si quiere. */
          initialAngle={reducedMotion || isViewer ? 0 : DROP_ANGLE_RAD}
          initialRadialVelocity={reducedMotion || isViewer ? 0 : DROP_RADIAL_VELOCITY}
          radialDamping={reducedMotion || isViewer ? 0.85 : DROP_RADIAL_DAMPING}
        />
      </div>

      {isViewer ? (
        <>
          <button type="button" className="hc-skip" onClick={onFinish} aria-label="Cerrar" autoFocus>
            <X size={16} strokeWidth={2.6} aria-hidden="true" /> 
          </button>
          {downloadError && <p className="hc-error" role="alert">{downloadError}</p>}
          <div className="hc-actions">
            <button type="button" className="hc-btn" onClick={toggleFlip}>
              <RotateCw size={16} strokeWidth={2.4} aria-hidden="true" /> Girar
            </button>
            <button type="button" className="hc-btn is-primary" onClick={() => void download()} disabled={downloading}>
              <Download size={16} strokeWidth={2.4} aria-hidden="true" /> {downloading ? 'Creando…' : 'Descargar imagen'}
            </button>
          </div>
          {/* Copia plana, fuera de pantalla, solo para exportar. */}
          <div ref={sheetRef} aria-hidden="true" style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }}>
            <CredentialSheet badge={badge} />
          </div>
        </>
      ) : (
        <button type="button" className="hc-skip" onClick={onFinish} autoFocus>
          Omitir
        </button>
      )}

      {!isViewer && (
        <footer className="try-footer">
          <span className="try-footer-hint">Arrastra el gafete · doble toque para girarlo</span>
        </footer>
      )}
    </div>,
    document.body,
  );
}
