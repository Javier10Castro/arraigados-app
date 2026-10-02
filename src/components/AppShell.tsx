import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Gift, Home, LogOut, MoreHorizontal, QrCode, Utensils, Images } from 'lucide-react';
import Wordmark from './Wordmark';
import RingsMark from './RingsMark';
import Ambient from './Ambient';
import styles from './AppShell.module.css';
import UserAvatar from './UserAvatar';
import { firstName, usePulseSession } from '../context/PulseSession';

const primaryNav = [
  { to: '/inicio', label: 'Inicio', Icon: Home },
  { to: '/programa', label: 'Programa', Icon: CalendarDays },
  { to: '/beneficios', label: 'Beneficios', Icon: Gift },
  { to: '/mas', label: 'Más', Icon: MoreHorizontal },
];

const quickLinks = [
  { to: '/comida', label: 'Comida', Icon: Utensils },
  { to: '/instantaneas', label: 'Instantáneas', Icon: Images },
  { to: '/recursos', label: 'Recursos', Icon: QrCode },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { me, signOut } = usePulseSession();
  const fullName = me?.attendee.fullName ?? '';
  const displayName = firstName(fullName);

  const logout = () => {
    signOut();
    navigate('/');
  };

  return (
    <div className={styles.shell}>
      <Ambient variant={pathname === '/inicio' ? 'home' : 'event'} />

      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <NavLink to="/inicio" aria-label="Arraigados · Ir al inicio">
            <Wordmark className={styles.brandMark} variant="cream" />
          </NavLink>
          <RingsMark className={styles.brandRings} />
          <span className={styles.brandLabel}>Congreso 2K26</span>
        </div>

        <nav className={styles.nav} aria-label="Navegación principal">
          {primaryNav.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
            >
              <Icon size={19} strokeWidth={2.1} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <p className={styles.quickLabel}>Accesos rápidos</p>
        <nav className={styles.quick} aria-label="Accesos rápidos">
          {quickLinks.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `${styles.quickItem} ${isActive ? styles.quickItemActive : ''}`}
            >
              <Icon size={16} strokeWidth={2.1} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.eventInfo}>
          <span>17 y 18 de octubre</span>
          <strong>ARRAIGADOS<br />EN CRISTO.</strong>
          <span>Red Juvenil Tijuana · Colosenses 2:6–7</span>
        </div>

        <div className={styles.userCard}>
          <UserAvatar className={styles.avatar} attendeeId={me?.attendee.id} name={fullName} />
          <div className={styles.userInfo}>
            <strong>Hola, {displayName}</strong>
            <span>{me?.package.name ?? ''}</span>
          </div>
          <button type="button" className={styles.logout} aria-label="Cerrar sesión" onClick={logout}>
            <LogOut size={16} strokeWidth={2.2} />
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>

      <nav className={styles.bottom} aria-label="Navegación principal">
        {primaryNav.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `${styles.bottomItem} ${isActive || (to === '/mas' && ['/comida', '/instantaneas', '/recursos'].includes(pathname)) ? styles.bottomItemActive : ''}`}
          >
            <Icon size={21} strokeWidth={2.1} />
            <span className={styles.bottomLabel}>{label}</span>
            <span className={styles.underline} aria-hidden="true" />
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
