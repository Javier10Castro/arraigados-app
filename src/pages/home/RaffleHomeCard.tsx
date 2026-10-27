import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { usePulseSession } from '../../context/PulseSession';
import { useMyRaffle } from '../../context/useMyRaffle';
import { prizeWithImage } from '../../data/rafflePrizes';
import homeStyles from './Home.module.css';
import styles from './RaffleHomeCard.module.css';

/**
 * Tarjeta «Rifa» de /home (migración 017): el premio del kit del asistente y un acceso a /rifa.
 * No aparece si su kit no tiene rifa, en la vista de visitante del equipo ni si las rifas no están habilitadas.
 */
export default function RaffleHomeCard() {
  const { me, isTeam } = usePulseSession();
  const { raffle } = useMyRaffle();
  const prize = prizeWithImage(me?.package.name);
  if (!prize || isTeam) return null;
  if (raffle.status === 'ready' && (!raffle.data.available || !raffle.data.hasRaffle)) return null;

  const d = raffle.status === 'ready' ? raffle.data : null;
  const cta = !d ? 'Ver rifa'
    : d.result?.youWon ? '¡Ganaste! Ver'
    : d.result ? 'Ver resultado'
    : d.entry ? 'Ya estás participando'
    : d.entriesOpen ? 'Entrar a rifa'
    : 'Ver premios';
  const sub = d?.entry ? 'Ya respondiste las 3 preguntas. ¡Suerte!' : 'Responde 3 preguntas sobre el congreso y participa.';

  return (
    <section className={`${homeStyles.section} ${homeStyles.current}`} aria-labelledby="rifa-title">
      <h2 className="label" id="rifa-title">Rifa</h2>
      <Link to="/rifa" className={styles.card} aria-label={`${prize.label}: ${prize.title}. ${cta}`}>
        <span className={`${styles.art} ${styles[`art_${prize.key}`]}`} aria-hidden="true">
          <img src={prize.image.src} alt="" width={prize.image.width} height={prize.image.height} />
        </span>
        <span className={styles.body}>
          <span className={styles.kicker}>{prize.label}</span>
          <strong className={styles.title}>{prize.title}</strong>
          <span className={styles.sub}>{prize.detail ? `${prize.detail} · ` : ''}{sub}</span>
        </span>
        <span className={`${styles.cta} ${d?.entry && !d.result ? styles.ctaDone : ''}`}>
          {cta}
          <ChevronRight size={15} strokeWidth={2.6} aria-hidden="true" />
        </span>
      </Link>
    </section>
  );
}
