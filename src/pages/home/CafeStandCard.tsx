import { MapPin } from 'lucide-react';
import { CAFE_STAND } from '../../data/homeCards';
import standPhoto from '../../assets/brand/salmos-stand.webp';
import homeStyles from './Home.module.css';
import styles from './CafeStandCard.module.css';

/**
 * Anuncio del stand de Salmos Café en /home (todos los usuarios). Solo informa; no vende ni pide nada.
 * Textos y ubicación se editan en data/homeCards.ts; la foto es src/assets/brand/salmos-stand.webp.
 */
export default function CafeStandCard() {
  const { kicker, title, body, location } = CAFE_STAND;
  return (
    <section className={`${homeStyles.section} ${homeStyles.current}`} aria-labelledby="cafe-title">
      <h2 className="label" id="cafe-title">
        Café
      </h2>
      <div className={styles.card}>
        <div className={styles.text}>
          <span className={styles.kicker}>{kicker.toUpperCase()}</span>
          <strong className={styles.title}>{title}</strong>
          <p className={styles.body}>{body}</p>
          {location && (
            <span className={styles.where}>
              <MapPin size={14} strokeWidth={2.3} aria-hidden="true" />
              {location}
            </span>
          )}
        </div>
        <img className={styles.photo} src={standPhoto} alt="Vaso de café helado con el sticker de Arraigados" width="560" height="701" loading="lazy" draggable={false} />
      </div>
    </section>
  );
}
