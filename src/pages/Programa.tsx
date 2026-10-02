import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import ScreenHeader from '../components/ScreenHeader';
import LocationButton from '../components/LocationButton';
import { schedule } from '../data/app';
import styles from './Programa.module.css';

export default function Programa() {
  // Día inicial: el primero con actividades reales (hoy sábado 17); si en
  // algún momento ningún día tuviera eventos, cae de vuelta al primero.
  const [dayId, setDayId] = useState(schedule.find((d) => d.events.length > 0)?.id ?? schedule[0].id);
  const day = schedule.find((d) => d.id === dayId)!;

  return (
    <div className={`page-enter ${styles.page}`}>
      <ScreenHeader title="Programa" />

      <div className={styles.days} role="tablist" aria-label="Días del congreso">
        {schedule.map((d) => (
          <button
            key={d.id}
            role="tab"
            aria-selected={d.id === dayId}
            type="button"
            className={`${styles.day} ${d.id === dayId ? styles.dayActive : ''}`}
            onClick={() => setDayId(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>

      <p className={styles.dayLong}>{day.long}</p>

      {day.events.length > 0 ? (
        <ol className={styles.timeline}>
          {day.events.map((ev) => (
            <li key={ev.id} className={styles.item}>
              <span className={styles.time}>{ev.time}</span>
              <div className={styles.card}>
                <span className={styles.kind}>{ev.kind}</span>
                <h3 className={styles.title}>{ev.title}</h3>
                <p className={styles.venue}>{ev.venue}</p>
                <LocationButton venue={ev.venue} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.empty}>
          <CalendarDays size={22} strokeWidth={1.8} />
          <p>{day.empty}</p>
        </div>
      )}
    </div>
  );
}
