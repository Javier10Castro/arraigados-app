import { useState } from 'react';
import { Bell, ChevronRight, Radio } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Badge from '../components/Badge';
import EventCard from '../components/EventCard';
import { nowEvent, upcomingEvents } from '../data/app';
import { firstName, usePulseSession } from '../context/PulseSession';
import UserAvatar from '../components/UserAvatar';
import styles from './Inicio.module.css';

const notifications = [
  { id: 1, title: 'La plenaria está en vivo', detail: 'Auditorio Principal · hasta las 21:30', live: true },
  { id: 2, title: 'Comida lista', detail: 'Recepción Norte · 14:00 - 15:30', live: false },
  { id: 3, title: 'Tu kit está disponible', detail: 'Recógelo en el punto de credenciales', live: false },
];

export default function Inicio() {
  const navigate = useNavigate();
  const { me } = usePulseSession();
  const fullName = me?.attendee.fullName ?? '';
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(true);

  const toggleBell = () => {
    const next = !open;
    setOpen(next);
    if (next) setUnread(false);
  };

  return (
    <div className={`page-enter ${styles.page}`}>
      <header className={styles.top}>
        <div className={styles.identity}>
          <UserAvatar className={styles.avatar} attendeeId={me?.attendee.id} name={fullName} />
          <div className={styles.identityText}>
            <span className={styles.hello}>Hola, {firstName(fullName)}</span>
            <Badge variant="tag">{me?.package.name ?? ''}</Badge>
          </div>
        </div>
        <button type="button" className={styles.bell} aria-label="Notificaciones" aria-expanded={open} onClick={toggleBell}>
          <Bell size={20} strokeWidth={2.1} />
          {unread && <span className={styles.bellDot} aria-hidden="true" />}
        </button>

        {open && (
          <div className={styles.panel} role="dialog" aria-label="Notificaciones">
            <p className={styles.panelHead}>Notificaciones</p>
            <ul className={styles.panelList}>
              {notifications.map((n) => (
                <li key={n.id} className={styles.panelItem}>
                  <span className={styles.panelIcon} aria-hidden="true">
                    <Radio size={15} strokeWidth={2.2} />
                  </span>
                  <span className={styles.panelBody}>
                    <strong>{n.title}</strong>
                    <span>{n.detail}</span>
                  </span>
                  {n.live && <span className={styles.panelLive}>EN VIVO</span>}
                </li>
              ))}
            </ul>
            <button type="button" className={styles.panelClose} onClick={() => setOpen(false)}>
              Cerrar
            </button>
          </div>
        )}
      </header>

      <section className={`${styles.section} ${styles.current}`}>
        <h2 className="label">Ahora</h2>
        <EventCard
          variant="now"
          kind={nowEvent.kind}
          title={nowEvent.title}
          venue={nowEvent.venue}
          time={nowEvent.time}
          live={nowEvent.live}
        />
      </section>

      <section className={`${styles.section} ${styles.agenda}`}>
        <div className={styles.sectionHead}>
          <h2 className="label">Próximos eventos</h2>
          <button type="button" className={styles.link} onClick={() => navigate('/programa')}>
            Ver programa
            <ChevronRight size={15} strokeWidth={2.4} />
          </button>
        </div>
        <div className={styles.list}>
          {upcomingEvents.map((ev) => (
            <EventCard key={ev.id} kind={ev.kind} title={ev.title} venue={ev.venue} time={ev.time} />
          ))}
        </div>
      </section>
    </div>
  );
}
