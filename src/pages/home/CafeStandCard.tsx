import { Coffee, MapPin } from 'lucide-react';
import { CAFE_STAND } from '../../data/homeCards';
import homeStyles from './Home.module.css';
import styles from './CafeStandCard.module.css';

/**
 * Anuncio "Tenemos stand de café" de /home (todos los usuarios). Solo informa; no vende ni pide nada.
 * Textos, ubicación y logo se editan en data/homeCards.ts.
 */
export default function CafeStandCard() {
  const { brand, title, body, location, logo } = CAFE_STAND;
  return (
    <section className={`${homeStyles.section} ${homeStyles.current}`} aria-labelledby="cafe-title">
      <h2 className="label" id="cafe-title">
        Café
      </h2>
      <div className={styles.card}>
        <div className={styles.text}>
          <span className={styles.kicker}>{brand.toUpperCase()}</span>
          <strong className={styles.title}>{title}</strong>
          <p className={styles.body}>{body}</p>
          {location && (
            <span className={styles.where}>
              <MapPin size={14} strokeWidth={2.3} aria-hidden="true" />
              {location}
            </span>
          )}
        </div>
        <div className={styles.mark} aria-hidden={logo ? undefined : true}>
          {logo ? (
            <img src={logo} alt={`Logo de ${brand}`} draggable={false} />
          ) : (
            <>
              <span className={styles.steam}>
                <i />
                <i />
                <i />
              </span>
              <Coffee size={44} strokeWidth={1.7} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
