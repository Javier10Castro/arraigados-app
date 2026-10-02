import { useState } from 'react';
import { Plus } from 'lucide-react';
import ScreenHeader from '../components/ScreenHeader';
import { foodDays, foodMenu } from '../data/app';
import styles from './Comida.module.css';

export default function Comida() {
  const [venue, setVenue] = useState(foodDays[0].id);

  return (
    <div className={`page-enter ${styles.page}`}>
      <ScreenHeader title="Comida" back="/mas" />

      <div className={styles.segment} role="tablist" aria-label="Sede">
        {foodDays.map((d) => (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={d.id === venue}
            className={`${styles.segmentItem} ${d.id === venue ? styles.segmentActive : ''}`}
            onClick={() => setVenue(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>

      <h2 className={styles.dayLabel}>
        <Plus size={14} strokeWidth={3} aria-hidden="true" />
        Sábado 18 de octubre
      </h2>

      <ul className={styles.list}>
        {foodMenu.map((item) => (
          <li key={item.id} className={styles.card}>
            <img className={styles.thumb} src={item.img} alt={item.name} loading="lazy" />
            <div className={styles.body}>
              <h3 className={styles.name}>{item.name}</h3>
              <p className={styles.desc}>{item.desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
