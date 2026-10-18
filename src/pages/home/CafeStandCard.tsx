import { Coffee, MapPin } from 'lucide-react';
import { CAFE_STANDS, type CafeStand } from '../../data/homeCards';
import homeStyles from './Home.module.css';
import styles from './CafeStandCard.module.css';

/**
 * Anuncio de los stands de café en /home (todos los usuarios). Solo informa; no vende ni pide nada.
 * Foto protagonista a todo el ancho de la tarjeta y panel de vidrio abajo con el texto.
 * Textos, sede y fotos se editan en data/homeCards.ts.
 */
function StandArticle({ s }: { s: CafeStand }) {
  return (
    <article className={styles.card}>
      {s.photo ? (
        <img className={styles.photo} src={s.photo} alt={s.photoAlt} width="900" height="900" loading="lazy" draggable={false} />
      ) : (
        <div className={styles.noPhoto} aria-hidden="true">
          <Coffee size={72} strokeWidth={1.4} />
        </div>
      )}
      <div className={styles.panel}>
        {s.location && (
          <span className={styles.where}>
            <MapPin size={12} strokeWidth={2.4} aria-hidden="true" />
            {s.location}
          </span>
        )}
        <span className={styles.kicker}>{s.kicker.toUpperCase()}</span>
        <strong className={styles.title}>{s.title}</strong>
        <p className={styles.body}>{s.body}</p>
      </div>
    </article>
  );
}

/**
 * `venue`: sede del asistente hoy (p. ej. '12va IAFCJ'). Solo se muestran los stands de esa sede; si no hay
 * ninguno, la sección no aparece. Con una sola tarjeta, queda centrada.
 */
export default function CafeStandCard({ venue }: { venue: string }) {
  const stands = CAFE_STANDS.filter((s) => s.location === venue);
  if (stands.length === 0) return null;
  return (
    <section className={`${homeStyles.section} ${homeStyles.current}`} aria-labelledby="cafe-title">
      <h2 className="label" id="cafe-title">
        Café
      </h2>
      <div className={`${styles.grid} ${stands.length === 1 ? styles.single : ''}`}>
        {stands.map((s) => (
          <StandArticle key={s.id} s={s} />
        ))}
      </div>
    </section>
  );
}
