import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, KeyRound, LogOut, MoreHorizontal, ScanLine } from 'lucide-react';
import Ambient from '../components/Ambient';
import Wordmark from '../components/Wordmark';
import RingsMark from '../components/RingsMark';
import UserAvatar from '../components/UserAvatar';
import { useStaffSession } from '../context/StaffSession';
import { ADMIN_SECTIONS } from './nav';
import s from './AdminShell.module.css';

/**
 * Marco del panel de Admin (diseño aprobado el 1 oct 2026):
 * - Computadora: menú lateral con todas las secciones, "Abrir Staff" y la
 *   tarjeta del usuario (cambiar contraseña, cerrar sesión).
 * - Celular: barra inferior Dashboard · Lotes · Asistentes · Más.
 * Mismo lenguaje visual que la app del asistente (fondo del flyer, crema, morado).
 */
/**
 * `title` es opcional: "Más" (celular) no lleva título.
 * `wide`: ensancha el contenido (1440 px en vez de 1040) para pantallas de
 * monitoreo; hoy solo lo usa el Dashboard.
 */
export default function AdminShell({
  title,
  action,
  wide = false,
  children,
}: {
  title?: string;
  action?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, signOut } = useStaffSession();
  const primary = ADMIN_SECTIONS.filter((x) => x.primary);
  const inMore = pathname === '/admin/mas' || ADMIN_SECTIONS.some((x) => !x.primary && pathname.startsWith(x.to));

  const logout = () => void signOut().then(() => navigate('/login', { replace: true }));

  return (
    <div className={s.shell}>
      <Ambient variant="event" />

      <aside className={s.sidebar}>
        <div className={s.brand}>
          <Wordmark className={s.brandMark} variant="cream" />
          <RingsMark className={s.brandRings} />
          <span className={s.brandLabel}>Admin</span>
        </div>

        <nav className={s.nav} aria-label="Secciones de Admin">
          {ADMIN_SECTIONS.map(({ to, label, Icon, ready, stage }) =>
            ready ? (
              <NavLink key={to} to={to} className={({ isActive }) => `${s.navItem} ${isActive ? s.navActive : ''}`}>
                <Icon size={18} strokeWidth={2.1} />
                <span>{label}</span>
              </NavLink>
            ) : (
              <span key={to} className={`${s.navItem} ${s.navSoon}`} aria-disabled="true" title={`Disponible en la ${stage}`}>
                <Icon size={18} strokeWidth={2.1} />
                <span>{label}</span>
                <em className={s.soon}>{stage}</em>
              </span>
            ),
          )}
        </nav>

        <p className={s.navLabel}>Herramientas</p>
        <NavLink to="/staff" className={s.staffLink}>
          <ScanLine size={18} strokeWidth={2.1} />
          <span>Abrir Staff</span>
          <ChevronRight size={16} />
        </NavLink>

        <div className={s.userCard}>
          <UserAvatar className={s.avatar} userId={user?.id} name={user?.name} />
          <div className={s.userInfo}>
            <strong>{user?.name}</strong>
            <span>Admin</span>
          </div>
          <button
            type="button"
            className={s.iconBtn}
            title="Cambiar mi contraseña"
            aria-label="Cambiar mi contraseña"
            onClick={() => navigate('/cuenta/contrasena')}
          >
            <KeyRound size={15} />
          </button>
          <button type="button" className={s.iconBtn} title="Cerrar sesión" aria-label="Cerrar sesión" onClick={logout}>
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      <main className={s.main}>
        <header className={`${s.topbar} ${wide ? s.wide : ''}`}>
          {title && <h1 className={s.title}>{title}</h1>}
          {action}
        </header>
        <div className={`${s.content} ${wide ? s.wide : ''}`}>{children}</div>
      </main>

      <nav className={s.bottom} aria-label="Navegación de Admin">
        {primary.map(({ to, label, Icon, ready, stage }) =>
          ready ? (
            <NavLink key={to} to={to} className={({ isActive }) => `${s.bottomItem} ${isActive ? s.bottomActive : ''}`}>
              <Icon size={21} strokeWidth={2.1} />
              <span>{label}</span>
            </NavLink>
          ) : (
            <span key={to} className={`${s.bottomItem} ${s.bottomSoon}`} aria-disabled="true" title={`Disponible en la ${stage}`}>
              <Icon size={21} strokeWidth={2.1} />
              <span>{label}</span>
            </span>
          ),
        )}
        <NavLink to="/admin/mas" className={`${s.bottomItem} ${inMore ? s.bottomActive : ''}`}>
          <MoreHorizontal size={21} strokeWidth={2.1} />
          <span>Más</span>
        </NavLink>
      </nav>
    </div>
  );
}

/** "Más" del celular: secciones que no caben en la barra + cuenta. */
export function AdminMas() {
  const navigate = useNavigate();
  const { signOut } = useStaffSession();
  return (
    <AdminShell>
      <ul className={s.moreList}>
        {ADMIN_SECTIONS.filter((x) => !x.primary).map(({ to, label, Icon, ready, stage }) => (
          <li key={to}>
            {ready ? (
              <NavLink to={to} className={s.moreRow}>
                <span className={s.moreIcon}>
                  <Icon size={18} />
                </span>
                <strong>{label}</strong>
                <ChevronRight size={18} />
              </NavLink>
            ) : (
              <span className={`${s.moreRow} ${s.moreSoon}`} aria-disabled="true">
                <span className={s.moreIcon}>
                  <Icon size={18} />
                </span>
                <strong>{label}</strong>
                <em>{stage}</em>
              </span>
            )}
          </li>
        ))}
        <li>
          <NavLink to="/staff" className={s.moreRow}>
            <span className={s.moreIcon}>
              <ScanLine size={18} />
            </span>
            <strong>Abrir Staff</strong>
            <ChevronRight size={18} />
          </NavLink>
        </li>
      </ul>
      <ul className={s.moreList}>
        <li>
          <button type="button" className={s.moreRow} onClick={() => navigate('/cuenta/contrasena')}>
            <span className={s.moreIcon}>
              <KeyRound size={18} />
            </span>
            <strong>Cambiar mi contraseña</strong>
            <ChevronRight size={18} />
          </button>
        </li>
        <li>
          <button
            type="button"
            className={s.moreRow}
            onClick={() => void signOut().then(() => navigate('/login', { replace: true }))}
          >
            <span className={`${s.moreIcon} ${s.danger}`}>
              <LogOut size={18} />
            </span>
            <strong>Cerrar sesión</strong>
            <ChevronRight size={18} />
          </button>
        </li>
      </ul>
    </AdminShell>
  );
}
