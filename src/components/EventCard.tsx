import { Clock, MapPin, Radio } from 'lucide-react';
import Badge from './Badge';
import LocationButton from './LocationButton';
import styles from './EventCard.module.css';

type Props = {
  kind: string;
  title: string;
  venue: string;
  time: string;
  live?: boolean;
  variant?: 'now' | 'upcoming';
};

export default function EventCard({ kind, title, venue, time, live, variant = 'upcoming' }: Props) {
  if (variant === 'now') {
    return (
      <article className={styles.now}>
        <div className={styles.nowTop}>
          <span className={styles.nowKind}>{kind}</span>
          {live && (
            <Badge variant="live" dot>
              En vivo
            </Badge>
          )}
        </div>
        <h3 className={styles.nowTitle}>{title}</h3>
        <ul className={styles.nowMeta}>
          <li>
            <MapPin size={15} strokeWidth={2.2} />
            {venue}
          </li>
          <li>
            <Clock size={15} strokeWidth={2.2} />
            {time}
          </li>
        </ul>
        <LocationButton venue={venue} />
      </article>
    );
  }

  return (
    <article className={styles.next}>
      <span className={styles.nextIcon} aria-hidden="true">
        <Radio size={17} strokeWidth={2.2} />
      </span>
      <div className={styles.nextBody}>
        <h3 className={styles.nextTitle}>{title}</h3>
        <p className={styles.nextVenue}>{venue}</p>
        <span className={styles.nextTime}>{time}</span>
        <LocationButton venue={venue} />
      </div>
    </article>
  );
}
