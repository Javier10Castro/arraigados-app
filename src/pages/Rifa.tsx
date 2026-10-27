import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiRequestError } from '../lib/api';
import type { PublicRaffle } from '../../shared/api';
import { prizeWithImage } from '../data/rafflePrizes';
import s from './Rifa.module.css';

/**
 * Vista PÚBLICA de una rifa para proyector (/rifa/:id). Solo lee (GET /api/raffle/:id); no tiene ningún control ni
 * llamada que sortee. El ganador lo decide y guarda el servidor cuando un Admin sortea; aquí solo se anima:
 *  · al abrir la página NO se anima nada: se muestran los resultados ya guardados (recargar no repite nada);
 *  · cuando el servidor reporta un ganador nuevo, la ruleta gira y se detiene en un sector, y entonces se anuncia
 *    el nombre (nombre + inicial del apellido, como lo entrega el servidor) (ya confirmado y guardado). La ruleta no contiene datos de participantes.
 *  · «Gana la salida #N» (migración 017): las salidas anteriores se anuncian como «Salida #k · no gana» (sin confeti)
 *    y la salida N como «¡Tenemos ganador!» con el premio del kit.
 */
const SEGMENTS = 12;
const SEG_DEG = 360 / SEGMENTS;
const POLL_MS = 2500;
const SPIN_MS = 6000;
const REVEAL_MS = 14000;
const REVEAL_MISS_MS = 7000; // una salida que no gana se anuncia más breve
const SEG_COLORS = ['#3e07a6', '#f2f7d7', '#7b5bff', '#c0b8df'];

type Win = PublicRaffle['winners'][number];
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function wedge(i: number) {
  const a0 = ((i * SEG_DEG - 90) * Math.PI) / 180;
  const a1 = (((i + 1) * SEG_DEG - 90) * Math.PI) / 180;
  const r = 190;
  const p = (a: number) => `${200 + r * Math.cos(a)} ${200 + r * Math.sin(a)}`;
  return `M200 200 L${p(a0)} A${r} ${r} 0 0 1 ${p(a1)} Z`;
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
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'reveal'>('idle');
  const [rot, setRot] = useState(0);
  const [landed, setLanded] = useState<number | null>(null);
  const [current, setCurrent] = useState<Win | null>(null);
  const [presented, setPresented] = useState<number | null>(null); // ganadores ya anunciados en pantalla
  const queue = useRef<Win[]>([]);
  const presentedRef = useRef<number | null>(null);
  const knownRef = useRef(0); // mayor posición ya vista (mostrada, en cola o en animación)
  const rotRef = useRef(0);
  const timers = useRef<number[]>([]);

  const clearTimers = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };
  useEffect(() => clearTimers, []);

  const next = useCallback(() => {
    const w = queue.current.shift();
    if (!w) { setPhase('idle'); return; }
    setCurrent(w);
    const finish = () => {
      setPhase('reveal');
      setPresented((p) => { const v = Math.max(p ?? 0, w.position); presentedRef.current = v; return v; });
      timers.current.push(window.setTimeout(() => (queue.current.length ? next() : setPhase('idle')), w.winner ? REVEAL_MS : REVEAL_MISS_MS));
    };
    if (reducedMotion()) { setLanded(null); finish(); return; }
    const k = Math.floor(Math.random() * SEGMENTS);
    const jitter = (Math.random() - 0.5) * (SEG_DEG * 0.6);
    const base = Math.floor(rotRef.current / 360) * 360 + 360 * 6;
    const target = base + (360 - (k * SEG_DEG + SEG_DEG / 2 + jitter));
    rotRef.current = target;
    setLanded(null);
    setPhase('spinning');
    setRot(target);
    timers.current.push(window.setTimeout(() => { setLanded(k); finish(); }, SPIN_MS));
  }, []);

  // Consulta periódica (solo lectura) mientras la pestaña está visible.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const d = await api.publicRaffle(id);
        if (!alive) return;
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
        <div className={s.wheelWrap} aria-hidden={phase === 'reveal'}>
          <div className={s.pointer} aria-hidden="true" />
          <svg viewBox="0 0 400 400" className={s.wheel} style={{ transform: `rotate(${rot}deg)`, transitionDuration: phase === 'spinning' ? `${SPIN_MS}ms` : '0ms' }} role="img" aria-label="Ruleta de la rifa">
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <path key={i} d={wedge(i)} fill={SEG_COLORS[i % 4]} stroke="#13043f" strokeWidth="3" className={landed === i ? s.hit : undefined} />
            ))}
            {Array.from({ length: SEGMENTS }, (_, i) => {
              const a = ((i + 0.5) * SEG_DEG - 90) * (Math.PI / 180);
              return <text key={i} x={200 + 140 * Math.cos(a)} y={200 + 140 * Math.sin(a)} textAnchor="middle" dominantBaseline="central" className={s.seg} fill={i % 4 === 1 || i % 4 === 3 ? '#1e0263' : '#f2f7d7'} transform={`rotate(${(i + 0.5) * SEG_DEG} ${200 + 140 * Math.cos(a)} ${200 + 140 * Math.sin(a)})`}>★</text>;
            })}
            <circle cx="200" cy="200" r="46" fill="#13043f" stroke="#f2f7d7" strokeWidth="5" />
            <text x="200" y="200" textAnchor="middle" dominantBaseline="central" className={s.hub} fill="#f2f7d7">2K26</text>
          </svg>
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
            {phase === 'spinning' ? 'Girando…'
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
      {phase === 'reveal' && current && !current.winner && (
        <div className={`${s.reveal} ${s.revealMiss}`} role="alert" data-testid="rifa-salida" data-position={current.position}>
          <div className={s.revealCard}>
            <p className={s.rv2}>Salida #{current.position}</p>
            <p className={s.rv3}>{current.name}</p>
            <p className={s.rv1}>No gana…</p>
            {winPos !== null && <p className={s.rv4}>¡Gana la salida #{winPos}! Faltan {Math.max(0, winPos - current.position)}.</p>}
          </div>
        </div>
      )}
    </main>
  );
}
