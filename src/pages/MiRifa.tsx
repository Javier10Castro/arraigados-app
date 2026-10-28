import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, PartyPopper, Ticket, Trophy } from 'lucide-react';
import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';
import { usePulseSession } from '../context/PulseSession';
import { useMyRaffle } from '../context/useMyRaffle';
import { api } from '../lib/api';
import { PRIZES, prizeWithImage, type PrizeWithImage } from '../data/rafflePrizes';
import { RAFFLE_ANSWER_MAX, RAFFLE_ANSWER_MIN, RAFFLE_PLENARIES, RAFFLE_QUESTIONS, cleanAnswer } from '../../shared/raffle';
import type { MyRaffleResponse } from '../../shared/api';
import s from './MiRifa.module.css';

/**
 * /rifa — «Rifa» del asistente (migración 017).
 *  1. Ve el premio de SU kit (el kit sale de su pulsera, en el servidor).
 *  2. «Entrar a rifa» abre 3 preguntas sobre el congreso, una por pantalla.
 *  3. Al enviar queda inscrito (una sola vez; volver a enviar no cambia nada) y aquí mismo verá el resultado del sorteo.
 * Quién gana lo decide el servidor cuando un Admin hace el sorteo; esta pantalla solo lee.
 */

const STEPS = [
  { key: 'liked', q: RAFFLE_QUESTIONS.liked, hint: 'Un momento, una canción, una actividad… lo que quieras.' },
  { key: 'plenary', q: RAFFLE_QUESTIONS.plenary, hint: 'Elige una.' },
  { key: 'lesson', q: RAFFLE_QUESTIONS.lesson, hint: 'Con tus palabras, aunque sea una frase.' },
] as const;

/** «Plenaria 1 — Raíces profundas» -> { tag: 'Plenaria 1', title: 'Raíces profundas' } */
const splitPlenary = (p: string) => {
  const [tag, ...rest] = p.split(' — ');
  return { tag, title: rest.join(' — ') || tag };
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Tijuana', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });

function PrizeHero({ prize }: { prize: PrizeWithImage }) {
  return (
    <section className={s.hero} aria-label={`Premio de tu rifa: ${prize.title}`}>
      <div className={s.heroText}>
        <span className={s.kicker}>Tu rifa · {prize.label}</span>
        <strong className={s.heroTitle}>{prize.title}</strong>
        {prize.detail && <span className={s.heroDetail}>{prize.detail}</span>}
      </div>
      <div className={`${s.heroArt} ${s[`art_${prize.key}`]}`}>
        <img src={prize.image.src} width={prize.image.width} height={prize.image.height} alt={prize.title} draggable={false} />
      </div>
    </section>
  );
}

function Questions({ token, onDone }: { token: string; onDone: (d: MyRaffleResponse) => void }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ liked: '', plenary: '', lesson: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const current = STEPS[step];
  const value = answers[current.key];
  const last = step === STEPS.length - 1;

  useEffect(() => {
    setError('');
    fieldRef.current?.focus();
  }, [step]);

  const valid = current.key === 'plenary' ? RAFFLE_PLENARIES.includes(value) : [...cleanAnswer(value)].length >= RAFFLE_ANSWER_MIN;

  const next = async () => {
    if (!valid) {
      setError(current.key === 'plenary' ? 'Elige tu plenaria favorita.' : 'Escribe un poquito más para continuar.');
      return;
    }
    if (!last) { setStep(step + 1); return; }
    setBusy(true);
    setError('');
    try {
      onDone(await api.enterRaffle(token, answers));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={s.quiz} onSubmit={(e) => { e.preventDefault(); void next(); }} aria-label="Preguntas para entrar a la rifa">
      <div className={s.progress} aria-hidden="true">
        {STEPS.map((st, i) => <span key={st.key} className={i <= step ? s.dotOn : s.dot} />)}
      </div>
      <p className={s.stepCount}>Pregunta {step + 1} de {STEPS.length}</p>
      <h2 className={s.question} id={`q-${current.key}`}>{current.q}</h2>
      <p className={s.hint}>{current.hint}</p>

      {current.key === 'plenary' ? (
        <div className={s.options} role="radiogroup" aria-labelledby="q-plenary">
          {RAFFLE_PLENARIES.map((p) => {
            const { tag, title } = splitPlenary(p);
            const on = answers.plenary === p;
            return (
              <label key={p} className={`${s.option} ${on ? s.optionOn : ''}`}>
                <input type="radio" name="plenary" value={p} checked={on} onChange={() => { setAnswers({ ...answers, plenary: p }); setError(''); }} />
                <span className={s.optionTag}>{tag}</span>
                <span className={s.optionTitle}>{title}</span>
                <span className={s.optionCheck} aria-hidden="true"><Check size={14} strokeWidth={3.2} /></span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className={s.field}>
          <textarea
            ref={fieldRef}
            aria-labelledby={`q-${current.key}`}
            value={value}
            maxLength={RAFFLE_ANSWER_MAX}
            rows={4}
            placeholder="Escribe tu respuesta…"
            onChange={(e) => { setAnswers({ ...answers, [current.key]: e.target.value }); setError(''); }}
          />
          <span className={s.counter}>{[...value].length} / {RAFFLE_ANSWER_MAX}</span>
        </div>
      )}

      {error && <p className={s.error} role="alert">{error}</p>}

      <div className={s.nav}>
        {step > 0 ? (
          <Button variant="outline" disabled={busy} onClick={() => setStep(step - 1)}>
            <ArrowLeft size={16} strokeWidth={2.4} /> Atrás
          </Button>
        ) : <span />}
        <Button type="submit" disabled={busy}>
          {last ? (busy ? 'Enviando…' : <>Entrar a la rifa <Ticket size={16} strokeWidth={2.4} /></>) : <>Siguiente <ArrowRight size={16} strokeWidth={2.4} /></>}
        </Button>
      </div>
    </form>
  );
}

function Result({ result, prize }: { result: NonNullable<MyRaffleResponse['result']>; prize: PrizeWithImage }) {
  if (result.youWon) {
    return (
      <div className={s.won} role="status">
        <span className={s.wonIcon} aria-hidden="true"><Trophy size={26} strokeWidth={2.2} /></span>
        <strong className={s.wonTitle}>¡Ganaste!</strong>
        <p>Saliste ganador(a) de la {prize.label}: <strong>{prize.title}</strong>.</p>
        <p className={s.muted}>Acércate al equipo de coordinación para recibir tu premio.</p>
      </div>
    );
  }
  return (
    <div className={s.resultBox} role="status">
      <span className="label">Resultado del sorteo</span>
      <p className={s.resultName}>{result.winners.length > 1 ? 'Ganadores' : 'Ganador(a)'}: <strong>{result.winners.join(', ')}</strong></p>
      <p className={s.muted}>¡Gracias por participar y por ser parte de Arraigados 2K26!</p>
    </div>
  );
}

export default function MiRifa() {
  const { me } = usePulseSession();
  const { raffle, token, setData, reload } = useMyRaffle();
  const [asking, setAsking] = useState(false);
  const [justEntered, setJustEntered] = useState(false);
  const prize = prizeWithImage(me?.package.name);

  let body: ReactNode;
  if (raffle.status === 'loading') body = <p className={s.muted}>Cargando tu rifa…</p>;
  else if (raffle.status === 'team') body = <p className={s.muted}>Las cuentas del equipo no participan en la rifa. Aquí puedes ver los premios.</p>;
  else if (raffle.status === 'error') {
    body = (
      <div className={s.stack}>
        <p className={s.error} role="alert">{raffle.message}</p>
        <Button variant="outline" size="sm" onClick={() => void reload()}>Reintentar</Button>
      </div>
    );
  } else {
    const d = raffle.data;
    if (!d.hasRaffle) body = <p className={s.muted}>Tu inscripción no incluye rifa. ¡Gracias por acompañarnos!</p>;
    else if (!d.available) body = <p className={s.muted}>La rifa estará disponible muy pronto.</p>;
    else if (d.entry?.removed) {
      // El equipo lo quitó de la rifa (018): no participa y no puede volver a inscribirse.
      body = (
        <div className={s.stack}>
          {d.result && prize && <Result result={d.result} prize={prize} />}
          <div className={s.entered}>
            <span className={`${s.enteredIcon} ${s.enteredOff}`} aria-hidden="true"><Ticket size={20} strokeWidth={2.4} /></span>
            <div>
              <strong>No estás participando</strong>
              <span>El equipo retiró tu inscripción de esta rifa. Si crees que es un error, acércate al equipo de coordinación.</span>
            </div>
          </div>
        </div>
      );
    } else if (d.entry) {
      body = (
        <div className={s.stack}>
          {d.result && prize && <Result result={d.result} prize={prize} />}
          <div className={`${s.entered} ${justEntered ? s.enteredPop : ''}`}>
            <span className={s.enteredIcon} aria-hidden="true">{justEntered ? <PartyPopper size={22} strokeWidth={2.2} /> : <Check size={22} strokeWidth={3} />}</span>
            <div>
              <strong>{justEntered ? '¡Listo, ya estás en la rifa!' : 'Ya estás participando'}</strong>
              <span>{d.result ? `Te inscribiste el ${when(d.entry.createdAt)}` : 'El resultado aparecerá aquí cuando se haga el sorteo.'}</span>
            </div>
          </div>
          <details className={s.answers}>
            <summary>Tus respuestas</summary>
            <dl>
              <dt>{RAFFLE_QUESTIONS.liked}</dt><dd>{d.entry.liked}</dd>
              <dt>{RAFFLE_QUESTIONS.plenary}</dt><dd>{d.entry.plenary}</dd>
              <dt>{RAFFLE_QUESTIONS.lesson}</dt><dd>{d.entry.lesson}</dd>
            </dl>
          </details>
        </div>
      );
    } else if (d.result && prize) body = <div className={s.stack}><Result result={d.result} prize={prize} /></div>;
    else if (!d.entriesOpen) body = <p className={s.muted}>Las inscripciones a la rifa ya cerraron.</p>;
    else if (asking) body = <Questions token={token} onDone={(data) => { setJustEntered(true); setAsking(false); setData(data); }} />;
    else {
      body = (
        <div className={s.intro}>
          <h2 className={s.introTitle}>Participa en la rifa de tu kit</h2>
          <p>Responde <strong>3 preguntas</strong> sobre el congreso y entra a la rifa del <strong>{d.kitName}</strong>. Solo participan quienes respondan.</p>
          <Button block onClick={() => setAsking(true)}>
            <Ticket size={17} strokeWidth={2.4} /> Entrar a rifa
          </Button>
        </div>
      );
    }
  }

  return (
    <div className={`page-enter ${s.page}`}>
      <ScreenHeader title="Rifa" back="/home" />
      {prize && <PrizeHero prize={prize} />}
      <section className={s.panel}>{body}</section>

      <section className={s.others} aria-labelledby="premios-title">
        <div className={s.othersHead}>
          <h2 className="label" id="premios-title">Premios de la rifa</h2>
          <Link to="/premios" className={s.othersLink}>Ver en pantalla completa</Link>
        </div>
        <ul className={s.mini}>
          {PRIZES.map((p) => (
            <li key={p.key} className={p.key === prize?.key ? s.miniOn : undefined}>
              <span className={s.miniArt}><img src={p.image.src} alt="" width={p.image.width} height={p.image.height} loading="lazy" /></span>
              <span className={s.miniBody}>
                <span className={s.miniLabel}>{p.label}{p.key === prize?.key ? ' · tu kit' : ''}</span>
                <strong>{p.title}</strong>
                {p.detail && <span>{p.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
