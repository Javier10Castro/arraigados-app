import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, ChevronRight, KeyRound, LogOut, MoreHorizontal, QrCode, ScanLine } from 'lucide-react';
import Ambient from '../components/Ambient';
import Wordmark from '../components/Wordmark';
import RingsMark from '../components/RingsMark';
import UserAvatar from '../components/UserAvatar';
import { useStaffSession } from '../context/StaffSession';
import { useTeamNav } from '../context/useTeamNav';
import { useOwnPulseLink, type OwnPulseLink } from '../context/useOwnPulseLink';
import { visibleSections } from './nav';
import { pressioText } from '../lib/pressio';
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
/**
 * «Vincular pulsera»: el estado sale del servidor (GET /api/staff-me). Pendiente = enlace con aviso; vinculada = fila
 * inactiva con check (no es un enlace, para no invitar a repetir la configuración).
 */
function PulseLinkItem({ link, variant, onVisitor }: { link: OwnPulseLink; variant: 'side' | 'more'; onVisitor: () => void }) {
  const side = variant === 'side';
  const cls = side ? s.staffLink : s.moreRow;
  if (link.phase === 'loading') return null;
  if (link.phase === 'linked') {
    // Pulsera ya vinculada: en lugar de una etiqueta muerta, el mismo atajo (flechas ida y vuelta) que usa la vista de visitante
    // para volver al equipo. Solo navega; el servidor valida la cookie del equipo en cada llamada.
    return (
      <button type="button" className={cls} onClick={onVisitor} aria-label="Entrar como visitante" title="Entrar como visitante">
        {side ? <ArrowLeftRight size={18} strokeWidth={2.1} /> : <span className={s.moreIcon}><ArrowLeftRight size={18} /></span>}
        <span>{side ? 'Modo visitante' : <strong>Modo visitante</strong>}</span>
        {!side && <ChevronRight size={18} />}
      </button>
    );
  }
  const badge = link.phase === 'pending' ? 'Pendiente' : link.phase === 'disabled' ? 'Revisar' : null;
  return (
    <NavLink to="/cuenta/pulsera" className={cls}>
      {side ? <QrCode size={18} strokeWidth={2.1} /> : <span className={s.moreIcon}><QrCode size={18} /></span>}
      <span>{side ? 'Vincular pulsera' : <strong>Vincular pulsera</strong>}</span>
      {badge && <em className={s.pulseBadge}>{badge}</em>}
      {!side && <ChevronRight size={18} />}
    </NavLink>
  );
}

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
  const teamNav = useTeamNav();
  const pulseLink = useOwnPulseLink();
  const sections = visibleSections(user?.canManageRaffles);
  const primary = sections.filter((x) => x.primary);
  const inMore = pathname === '/admin/mas' || sections.some((x) => !x.primary && pathname.startsWith(x.to));

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
          {sections.map(({ to, label, Icon, ready, stage }) =>
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
        <PulseLinkItem link={pulseLink} variant="side" onVisitor={() => void teamNav.toVisitor()} />

        <div className={s.userCard}>
          <UserAvatar className={s.avatar} userId={user?.id} name={user?.name} />
          <div className={s.userInfo}>
            <strong>{user?.name}</strong>
            <span>Admin</span>
          </div>
          {pulseLink.phase !== 'linked' && (
            <button
              type="button"
              className={s.iconBtn}
              title="Ver mi experiencia de visitante"
              aria-label="Ver mi experiencia de visitante"
              onClick={() => void teamNav.toVisitor()}
            >
              <ArrowLeftRight size={15} />
            </button>
          )}
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
          {title && <h1 className={s.title}>{pressioText(title)}</h1>}
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
  const { user, signOut } = useStaffSession();
  const teamNav = useTeamNav();
  const pulseLink = useOwnPulseLink();
  return (
    <AdminShell>
      <ul className={s.moreList}>
        {visibleSections(user?.canManageRaffles).filter((x) => !x.primary).map(({ to, label, Icon, ready, stage }) => (
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
          <PulseLinkItem link={pulseLink} variant="more" onVisitor={() => void teamNav.toVisitor()} />
        </li>
        {pulseLink.phase !== 'linked' && (
        <li>
          <button type="button" className={s.moreRow} onClick={() => void teamNav.toVisitor()}>
            <span className={s.moreIcon}>
              <ArrowLeftRight size={18} />
            </span>
            <strong>Ver mi experiencia de visitante</strong>
            <ChevronRight size={18} />
          </button>
        </li>
        )}
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
