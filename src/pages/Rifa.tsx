import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiRequestError } from '../lib/api';
import type { PublicRaffle } from '../../shared/api';
import { prizeWithImage } from '../data/rafflePrizes';
import s from './Rifa.module.css';

/**
 * Vista PÚBLICA de una rifa para proyector (/rifa/:id). Solo lee (GET /api/raffle/:id); no tiene ningún control ni
 * llamada que sortee. Quién sale lo decide y guarda el servidor cuando un Admin presiona «Sorteo»; aquí solo se anima:
 *  · al abrir la página NO se anima nada: se muestran las salidas ya guardadas (recargar no repite nada);
 *  · en espera, los nombres de quienes siguen participando pasan despacio por el «carrete» (`pool`, solo «Nombre I.»);
 *  · cuando el servidor reporta una salida nueva, los nombres pasan rápido, se frenan y se detienen en la persona que
 *    salió (ya confirmada y guardada). Si esa salida NO gana se marca ahí mismo; la ganadora («gana la salida #N»,
 *    migración 017) se anuncia además a pantalla completa con confeti y el premio.
 */
const POLL_MS = 2500;
const SPIN_MS = 6500; // los nombres pasan rápido y se frenan
const LAND_MS = 1800; // la ganadora se queda resaltada en el carrete antes del festejo
const REVEAL_MS = 14000;
const REVEAL_MISS_MS = 7000; // una salida que no gana se queda marcada en el carrete
const SEG_COLORS = ['#3e07a6', '#f2f7d7', '#7b5bff', '#c0b8df']; // colores del confeti
const VISIBLE = 7; // renglones visibles en el carrete
const CENTER = 3; // renglón del centro (el que «sale»)
const SPIN_ROWS = 46; // nombres que pasan antes de detenerse

type Win = PublicRaffle['winners'][number];
type Spin = { strip: string[]; target: number; go: boolean; key: number };
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function shuffled<T>(xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Tira de nombres para un giro: relleno al azar y, en la posición `target`, la persona que salió. */
function buildStrip(pool: readonly string[], fallback: readonly string[], name: string): { strip: string[]; target: number } {
  const base = pool.length ? pool : fallback.length ? fallback : ['★'];
  const fill: string[] = [];
  while (fill.length < SPIN_ROWS + CENTER + 1) fill.push(...shuffled(base));
  const strip = fill.slice(0, SPIN_ROWS);
  const target = strip.length;
  strip.push(name, ...fill.slice(SPIN_ROWS, SPIN_ROWS + CENTER + 1));
  return { strip, target };
}

function Reel({ pool, spin, phase, hitIsWinner }: { pool: string[]; spin: Spin | null; phase: string; hitIsWinner: boolean }) {
  // En espera: la lista de quienes siguen participando pasa despacio, en bucle (duplicada para que no haya salto).
  const idleList = useMemo(() => {
    if (pool.length === 0) return [];
    let l = shuffled(pool);
    while (l.length < VISIBLE + 1) l = [...l, ...shuffled(pool)];
    return l;
  }, [pool]);
  const showSpin = spin !== null && phase !== 'idle';
  const landed = phase === 'landed' || phase === 'reveal';
  const offset = showSpin ? (spin.go || landed ? CENTER - spin.target : CENTER) : 0;

  return (
    <div className={s.reelWrap} aria-hidden="true">
      <div className={s.reel}>
        <div className={`${s.band} ${landed ? (hitIsWinner ? s.bandWin : s.bandMiss) : ''}`} />
        {showSpin ? (
          <div
            key={spin.key}
            className={`${s.strip} ${spin.go ? s.stripGo : ''}`}
            style={{ transform: `translateY(calc(var(--row) * ${offset}))`, transitionDuration: spin.go ? `${SPIN_MS}ms` : '0ms' }}
          >
            {spin.strip.map((n, i) => (
              <div key={i} className={`${s.row} ${landed && i === spin.target ? s.rowHit : ''}`}>{n}</div>
            ))}
          </div>
        ) : idleList.length ? (
          <div className={`${s.strip} ${s.stripIdle}`} style={{ animationDuration: `${Math.max(18, idleList.length * 1.4)}s` }}>
            {[...idleList, ...idleList].map((n, i) => <div key={i} className={s.row}>{n}</div>)}
          </div>
        ) : (
          <div className={s.reelEmpty}>Esperando participantes…</div>
        )}
      </div>
    </div>
  );
}

function Confetti() {
  const pieces = useMemo(
    () => Array.from({ length: 46 }, (_, i) => ({
      left: (i * 37) % 100, delay: ((i * 53) % 30) / 10, dur: 3.2 + ((i * 17) % 20) / 10, color: SEG_COLORS[i % 4], rot: (i * 47) % 360, w: 8 + (i % 4) * 3,
    })),
    [],
  );
  return (
    <div className={s.confetti} aria-hidden="true">
      {pieces.map((p, i) => (
        <span key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, background: p.color, width: p.w, height: p.w * 1.6, transform: `rotate(${p.rot}deg)` }} />
      ))}
    </div>
  );
}

export default function Rifa() {
  const { id = '' } = useParams();
  const [data, setData] = useState<PublicRaffle | null>(null);
  const [problem, setProblem] = useState<'' | 'notfound' | 'offline'>('');
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'landed' | 'reveal'>('idle');
  const [spin, setSpin] = useState<Spin | null>(null);
  const [current, setCurrent] = useState<Win | null>(null);
  const [presented, setPresented] = useState<number | null>(null); // ganadores ya anunciados en pantalla
  const queue = useRef<Win[]>([]);
  const presentedRef = useRef<number | null>(null);
  const knownRef = useRef(0); // mayor posición ya vista (mostrada, en cola o en animación)
  const dataRef = useRef<PublicRaffle | null>(null);
  const spinKey = useRef(0);
  const timers = useRef<number[]>([]);

  const clearTimers = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };
  useEffect(() => clearTimers, []);

  const next = useCallback(() => {
    const w = queue.current.shift();
    if (!w) { setPhase('idle'); return; }
    setCurrent(w);
    const after = () => (queue.current.length ? next() : setPhase('idle'));
    const land = () => {
      setPhase('landed');
      setPresented((p) => { const v = Math.max(p ?? 0, w.position); presentedRef.current = v; return v; });
      if (w.winner) {
        timers.current.push(window.setTimeout(() => {
          setPhase('reveal');
          timers.current.push(window.setTimeout(after, REVEAL_MS));
        }, LAND_MS));
      } else {
        timers.current.push(window.setTimeout(after, REVEAL_MISS_MS));
      }
    };
    const d = dataRef.current;
    const { strip, target } = buildStrip(d?.pool ?? [], (d?.winners ?? []).map((x) => x.name), w.name);
    const key = ++spinKey.current;
    setSpin({ strip, target, go: false, key });
    if (reducedMotion()) { land(); return; }
    setPhase('spinning');
    // Dos cuadros: primero se pinta la tira arriba, luego arranca la transición hasta la persona que salió.
    requestAnimationFrame(() => requestAnimationFrame(() => setSpin((sp) => (sp && sp.key === key ? { ...sp, go: true } : sp))));
    timers.current.push(window.setTimeout(land, SPIN_MS + 150));
  }, []);

  // Consulta periódica (solo lectura) mientras la pestaña está visible.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const d = await api.publicRaffle(id);
        if (!alive) return;
        dataRef.current = d;
        setData(d);
        setProblem('');
        if (presentedRef.current === null) {
          presentedRef.current = d.winnersCount; // primera carga: lo ya guardado se muestra sin animar
          knownRef.current = d.winnersCount;
          setPresented(d.winnersCount);
        } else {
          const fresh = d.winners.filter((w) => w.position > knownRef.current);
          if (fresh.length) {
            queue.current.push(...fresh);
            knownRef.current = Math.max(...fresh.map((w) => w.position));
          }
        }
      } catch (e) {
        if (!alive) return;
        setProblem(e instanceof ApiRequestError && e.httpStatus === 404 ? 'notfound' : 'offline');
      }
    };
    void tick();
    const t = window.setInterval(() => void tick(), POLL_MS);
    return () => { alive = false; window.clearInterval(t); };
  }, [id]);

  // Si llegó un ganador nuevo y no hay animación en curso, arranca.
  useEffect(() => {
    if (phase === 'idle' && queue.current.length && data) next();
  }, [data, phase, next]);

  if (problem === 'notfound') {
    return <main className={s.page}><p className={s.empty}>Esta rifa no existe.</p></main>;
  }
  if (!data) {
    return <main className={s.page}><p className={s.empty}>{problem === 'offline' ? 'Sin conexión. Reintentando…' : 'Cargando rifa…'}</p></main>;
  }

  const shownWinners = presented ?? data.winnersCount;
  const shownList = data.winners.filter((w) => w.position <= shownWinners);
  const remaining = data.remaining + Math.max(0, data.winnersCount - shownWinners);
  const done = data.status === 'COMPLETED' && shownWinners >= data.winnersCount;
  const winPos = data.winningPosition; // null = rifa anterior a la 017: todas las salidas ganan
  const prize = prizeWithImage(data.kitName);

  return (
    <main className={s.page} data-phase={phase} data-testid="rifa-publica">
      <header className={s.top}>
        <p className={s.kicker}>Arraigados 2K26</p>
        <h1 className={s.title}>{data.name}</h1>
      </header>

      <section className={s.stage}>
        <div className={s.reelCol}>
          <p className={s.reelHead}>
            <span>Participantes</span>
            <strong>{remaining}</strong>
          </p>
          <Reel pool={data.pool} spin={spin} phase={phase} hitIsWinner={!!current?.winner} />
          <div className={s.landNote} role="status" aria-live="polite">
            {phase === 'spinning' && <span className={s.landSpin}>Sorteando la salida #{current?.position}…</span>}
            {(phase === 'landed' || phase === 'reveal') && current && (
              current.winner ? (
                <span className={s.landWin}>¡Salida #{current.position}{current.extra ? ' · extra' : ''}: gana!</span>
              ) : (
                <>
                  <span className={s.landMiss}>Salida #{current.position} · No gana…</span>
                  {winPos !== null && <span className={s.landSub}>¡Gana la salida #{winPos}! Faltan {Math.max(0, winPos - current.position)}.</span>}
                </>
              )
            )}
          </div>
        </div>

        <aside className={s.side}>
          {prize && (
            <div className={s.prize}>
              <span className={s.prizeArt}><img src={prize.image.src} alt="" width={prize.image.width} height={prize.image.height} /></span>
              <span className={s.prizeText}>
                <span className={s.label}>Premio</span>
                <strong>{prize.title}</strong>
                {prize.detail.startsWith('$') && <em>{prize.detail}</em>}
              </span>
            </div>
          )}
          <div className={s.counters}>
            {winPos !== null ? (
              <div><span className={s.big}>{shownWinners}<small> / {winPos}</small></span><span className={s.label}>Salidas · gana la #{winPos}</span></div>
            ) : (
              <div><span className={s.big}>{shownWinners}<small> / {data.targetWinners}</small></span><span className={s.label}>Ganadores</span></div>
            )}
            <div><span className={s.big}>{remaining}</span><span className={s.label}>Participantes restantes</span></div>
          </div>
          <p className={s.status} role="status">
            {phase === 'spinning' ? 'Sorteando…'
              : data.status === 'CANCELLED' ? 'Rifa cancelada'
              : done ? 'Rifa completada'
              : remaining === 0 && shownWinners < data.targetWinners ? 'No hay más participantes elegibles'
              : winPos !== null && shownWinners < winPos ? `Esperando la salida #${shownWinners + 1}${shownWinners + 1 === winPos ? ' · ¡esta gana!' : ''}`
              : shownWinners === 0 ? 'Esperando el primer sorteo'
              : 'Esperando el siguiente sorteo'}
          </p>
          {shownList.length > 0 && (
            <ol className={s.winners} aria-label="Ganadores">
              {shownList.map((w) => (
                <li key={w.position} className={winPos !== null ? (w.winner ? s.isWin : s.isMiss) : undefined}>
                  <span className={s.pos}>{w.position}</span><span className={s.name}>{w.name}</span>
                  {w.extra ? <em>extra</em> : winPos !== null && w.winner ? <em>gana</em> : null}
                </li>
              ))}
            </ol>
          )}
        </aside>
      </section>

      {phase === 'reveal' && current && current.winner && (
        <div className={s.reveal} role="alert" data-testid="rifa-ganador" data-position={current.position}>
          {!reducedMotion() && <Confetti />}
          <div className={s.revealCard}>
            <p className={s.rv1}>¡Tenemos ganador!</p>
            <p className={s.rv2}>{data.kitName}{current.extra ? ' · sorteo extra' : winPos !== null ? ` · salida #${current.position}` : ''}</p>
            <p className={s.rv3}>{current.name}</p>
            {prize && (
              <div className={s.rvPrize}>
                <img src={prize.image.src} alt="" width={prize.image.width} height={prize.image.height} />
                <span>{prize.title}{prize.detail.startsWith('$') ? ` ${prize.detail}` : ''}</span>
              </div>
            )}
            <p className={s.rv4}>¡Felicidades! Tu momento ha llegado.</p>
          </div>
        </div>
      )}
    </main>
  );
}
