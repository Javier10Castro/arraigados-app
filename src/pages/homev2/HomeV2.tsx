import { useEffect, useMemo, useRef, useState } from 'react';
import Home from '../home/Home';
import IntroExperience from './IntroExperience';
import { buildBadge } from './credentialData';
import { usePulseSession } from '../../context/PulseSession';

/** Cuánto dura el desvanecido de la capa (debe coincidir con overlay.css). */
const FADE_MS = 500;

/**
 * /home (principal desde el 6 oct 2026; antes /homev2) — el Home de siempre, que antes muestra la animación del gafete (portada de HangingCards /try).
 *
 *   1. Home se monta debajo desde el primer momento (así sus datos ya están al terminar la animación).
 *   2. La animación, con los datos reales de /api/me, tapa todo; "Omitir" la corta cuando se quiera.
 *   3. Al terminar, la capa se desvanece y desaparece: lo que queda es el Home de siempre.
 *
 * Si /api/me no carga (o no hay sesión lista) no se bloquea nada: se muestra el Home directamente.
 * El Home anterior, sin animación, quedó en /homev2 (para comparar o volver atrás).
 * Hoy la animación se muestra SIEMPRE (cada vez que se entra a /home); `SHOW_INTRO` es el punto para limitarla (p. ej. una vez por sesión).
 */
const SHOW_INTRO = true;

type Stage = 'intro' | 'leaving' | 'done';

export default function HomeV2() {
  const { me, state } = usePulseSession();
  const [stage, setStage] = useState<Stage>(SHOW_INTRO ? 'intro' : 'done');
  const homeRef = useRef<HTMLDivElement>(null);

  const badge = useMemo(
    () => (me && state.phase === 'ready' ? buildBadge(me, `${window.location.origin}/p/${state.token}`) : null),
    [me, state],
  );

  const finish = () => setStage((s) => (s === 'intro' ? 'leaving' : s));
  useEffect(() => {
    if (stage !== 'leaving') return undefined;
    const t = window.setTimeout(() => setStage('done'), FADE_MS);
    return () => window.clearTimeout(t);
  }, [stage]);

  const showing = stage !== 'done' && badge !== null;

  /* Mientras la capa está encima, el Home no recibe foco ni lectores de pantalla. */
  useEffect(() => {
    const el = homeRef.current;
    if (!el) return;
    if (showing) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }, [showing]);

  /* Sin sesión lista todavía: no se enseña un Home "a medias" que luego quede tapado por la animación. */
  const waiting = SHOW_INTRO && stage === 'intro' && (state.phase === 'loading' || state.phase === 'none');

  return (
    <>
      <div ref={homeRef} style={waiting ? { visibility: 'hidden' } : undefined}>
        <Home />
      </div>
      {showing && badge && <IntroExperience badge={badge} leaving={stage === 'leaving'} onFinish={finish} />}
    </>
  );
}
