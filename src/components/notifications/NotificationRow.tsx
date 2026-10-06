import { Heart, Megaphone } from 'lucide-react';
import UserAvatar from '../UserAvatar';
import type { AppNotification } from '../../../shared/notifications';
import styles from './NotificationRow.module.css';

/** "hoy 3:05 p.m." / "sáb, 17 oct, 3:05 p.m." en hora de Tijuana (la del congreso). */
export function notificationWhen(iso: string): string {
  const d = new Date(iso);
  const tz = 'America/Tijuana';
  const day = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: tz });
  const time = d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz });
  if (day(d) === day(new Date())) return `hoy ${time}`;
  const wd = d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).replace('.', '');
  return `${wd}, ${time}`;
}

/**
 * Una fila de la campana. La usan /home (datos reales) y el formulario de Admin → Avisos
 * (vista previa de cómo se verá). Dos tipos:
 *   - aviso del equipo: icono de megáfono, título y mensaje, y opcionalmente la etiqueta "EN VIVO";
 *   - like: [avatar con corazón en círculo y número] {Nombre} le ha dado like a tu nota  (agrupado: "{Nombre} y N más le dieron like…").
 */
export default function NotificationRow({ n, fresh = false, whenLabel }: { n: AppNotification; fresh?: boolean; whenLabel?: string }) {
  const when = whenLabel ?? notificationWhen(n.at);
  if (n.kind === 'like') {
    const others = n.count - 1;
    const text =
      others <= 0
        ? `${n.likerFirstName} le ha dado like a tu nota`
        : `${n.likerFirstName} y ${others} más le dieron like a tu nota`;
    return (
      <li className={`${styles.row} ${fresh ? styles.fresh : ''}`}>
        <span className={styles.avatarWrap}>
          <UserAvatar size={38} attendeeId={n.likerAttendeeId} name={n.likerFirstName} />
          <span className={styles.heart} aria-hidden="true">
            <Heart size={11} strokeWidth={0} fill="currentColor" />
          </span>
          <span className={styles.count} aria-label={`${n.count} ${n.count === 1 ? 'like' : 'likes'}`}>
            {n.count}
          </span>
        </span>
        <span className={styles.body}>
          <strong>{text}</strong>
          <span className={styles.when}>{when}</span>
        </span>
      </li>
    );
  }
  return (
    <li className={`${styles.row} ${fresh ? styles.fresh : ''}`}>
      <span className={styles.icon} aria-hidden="true">
        <Megaphone size={15} strokeWidth={2.2} />
      </span>
      <span className={styles.body}>
        <strong>{n.title}</strong>
        <span>{n.body}</span>
        <span className={styles.when}>{when}</span>
      </span>
      {n.live && (
        <span className={styles.live}>
          <i aria-hidden="true" /> EN VIVO
        </span>
      )}
    </li>
  );
}
