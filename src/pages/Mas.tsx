import { lazy, Suspense, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  IdCard,
  LogOut,
  MapPin,
  QrCode,
  Utensils,
} from 'lucide-react';
import ScreenHeader from '../components/ScreenHeader';
import RingsMark from '../components/RingsMark';
import { firstName, usePulseSession } from '../context/PulseSession';
import UserAvatar from '../components/UserAvatar';
import styles from './Mas.module.css';

const GafeteViewer = lazy(() => import('./homev2/GafeteViewer'));

const links = [
  { to: '/comida', label: 'Comida', desc: 'Menú de ambas sedes', Icon: Utensils },
  // Instantáneas OCULTO (6 oct 2026). Para volver a mostrarlo: importar `Images` de lucide-react y descomentar:
  // { to: '/instantaneas', label: 'Instantáneas', desc: 'Lo que está pasando ahora', Icon: Images },
  { to: '/recursos', label: 'Recursos', desc: 'Fondos, stickers y presentaciones', Icon: QrCode },
];

export default function Mas() {
  const navigate = useNavigate();
  const { me, signOut } = usePulseSession();
  const [gafeteOpen, setGafeteOpen] = useState(false);
  const fullName = me?.attendee.fullName ?? '';
  const name = firstName(fullName);

  const logout = () => {
    signOut();
    navigate('/');
  };

  return (
    <div className={`page-enter ${styles.page}`}>
      <ScreenHeader title="Más" />

      <section className={styles.user}>
        <UserAvatar className={styles.avatar} attendeeId={me?.attendee.id} name={fullName} />
        <div className={styles.userInfo}>
          <strong>Hola, {name}</strong>
          <span>
            {me?.package.name} · {me?.attendee.churchName}
          </span>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className="label">Secciones</h2>
        <ul className={styles.list}>
          <li>
            <button type="button" className={`${styles.row} ${styles.rowButton}`} onClick={() => setGafeteOpen(true)}>
              <span className={styles.rowIcon} aria-hidden="true">
                <IdCard size={18} strokeWidth={2} />
              </span>
              <span className={styles.rowBody}>
                <strong>Mi gafete</strong>
                <span>Verlo, girarlo y descargarlo como imagen</span>
              </span>
              <ChevronRight className={styles.chevron} size={18} strokeWidth={2.2} />
            </button>
          </li>
          {links.map(({ to, label, desc, Icon }) => (
            <li key={to}>
              <NavLink to={to} className={styles.row}>
                <span className={styles.rowIcon} aria-hidden="true">
                  <Icon size={18} strokeWidth={2} />
                </span>
                <span className={styles.rowBody}>
                  <strong>{label}</strong>
                  <span>{desc}</span>
                </span>
                <ChevronRight className={styles.chevron} size={18} strokeWidth={2.2} />
              </NavLink>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className="label">Cuenta</h2>
        <ul className={styles.list}>
          <li>
            <button type="button" className={`${styles.row} ${styles.logoutRow}`} onClick={logout}>
              <span className={`${styles.rowIcon} ${styles.logoutIcon}`} aria-hidden="true">
                <LogOut size={18} strokeWidth={2} />
              </span>
              <span className={styles.rowBody}>
                <strong>Cerrar sesión</strong>
                <span>Para volver a entrar, escanea tu pulsera</span>
              </span>
              <ChevronRight className={styles.chevron} size={18} strokeWidth={2.2} />
            </button>
          </li>
        </ul>
      </section>

      <section className={styles.about}>
        <RingsMark className={styles.rings} variant="morado" />
        <h2 className={styles.aboutTitle}>Arraigados · Congreso 2K26</h2>
        <p className={styles.aboutLine}>
          <MapPin size={14} strokeWidth={2.2} />
          12va · 21ra Iglesia — Red Juvenil Tijuana
        </p>
        <p className={styles.aboutLine}>17 y 18 de octubre</p>
        <p className={`${styles.verse} script`}>Colosenses 2:6 - 7</p>
      </section>
      {gafeteOpen && (
        <Suspense fallback={null}>
          <GafeteViewer onClose={() => setGafeteOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
