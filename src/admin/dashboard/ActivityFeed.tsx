import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CupSoda, RefreshCcw, UserPlus } from 'lucide-react';
import UserAvatar from '../../components/UserAvatar';
import Pagination from '../../components/Pagination';
import { usePagedList } from '../../lib/usePagedList';
import type { DashboardActivity } from '../../../shared/api';
import { dayLabel, localDayOf, timeLabel } from './format';
import s from './Dashboard.module.css';

/**
 * Feed de actividad reciente. Fuente: `activity` de /api/admin/dashboard
 * (registros de "Attendee", canjes de "Redemption" y reemplazos de pulsera de
 * "AuditLog"), con sus fechas reales. No se inventan eventos.
 * Pestañas: Todo · Registros · Canjes (los reemplazos solo salen en "Todo").
 * Paginada en el navegador: 10 por página (el servidor manda hasta 25 de cada tipo).
 */
const TABS = [
  { key: 'all', label: 'Todo' },
  { key: 'registration', label: 'Registros' },
  { key: 'redemption', label: 'Canjes' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const META = {
  registration: { label: 'Nuevo registro', Icon: UserPlus },
  redemption: { label: 'Canje de agua', Icon: CupSoda },
  reassign: { label: 'Pulsera reemplazada', Icon: RefreshCcw },
} as const;

export default function ActivityFeed({ items, today }: { items: DashboardActivity[]; today: string }) {
  const [tab, setTab] = useState<Tab>('all');
  const filtered = tab === 'all' ? items : items.filter((i) => i.type === tab);
  // Pestaña → orden por fecha (ya viene así) → página de 10. Cambiar de pestaña regresa a la página 1.
  const paged = usePagedList(filtered, tab);
  const shown = paged.pageItems;

  return (
    <div className={s.feed}>
      <div className={s.tabs} role="tablist" aria-label="Tipo de actividad">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`${s.tab} ${tab === t.key ? s.tabOn : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className={s.note}>Sin actividad todavía.</p>
      ) : (
        <ol className={s.feedList} role="tabpanel">
          {shown.map((ev) => {
            const { label, Icon } = META[ev.type];
            const day = localDayOf(ev.at);
            return (
              <li key={`${ev.type}-${ev.id}`} className={s.feedItem}>
                <time className={s.feedTime} dateTime={ev.at}>
                  {timeLabel(ev.at)}
                  {day !== today && <small>{dayLabel(day)}</small>}
                </time>
                <UserAvatar className={s.avatarSm} attendeeId={ev.attendeeId} name={ev.attendeeName} />
                <div className={s.feedBody}>
                  <span className={`${s.feedType} ${s['ft_' + ev.type]}`}>
                    <Icon size={13} aria-hidden="true" /> {label}
                    {ev.type === 'redemption' && ev.quantity && ev.quantity > 1 ? ` ×${ev.quantity}` : ''}
                  </span>
                  <Link to={`/admin/asistentes/${encodeURIComponent(ev.attendeeId)}`} className={s.feedName}>
                    {ev.attendeeName}
                    {ev.type === 'registration' && ev.ageRange ? <span className={s.muted}> — {ev.ageRange} años</span> : null}
                  </Link>
                  <span className={s.feedMeta}>
                    {ev.churchName} · {ev.packageName}
                    {ev.staffName ? ` · Staff: ${ev.staffName}` : ''}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Pagination
        label="actividad"
        page={paged.page}
        pageSize={paged.pageSize}
        total={paged.total}
        onPageChange={paged.setPage}
        onPageSizeChange={paged.setPageSize}
      />
    </div>
  );
}
