import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import NotificationRow from '../components/notifications/NotificationRow';
import Button from '../components/Button';
import AdminShell from './AdminShell';
import AdminModal from './AdminModal';
import Pagination from '../components/Pagination';
import { Skeleton, SkeletonRows } from '../components/Skeleton';
import { api } from '../lib/api';
import { VENUE_12VA, VENUE_21RA } from '../data/app';
import { parsePageSize } from '../../shared/api';
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  type AdminAnnouncementRow,
  type AdminAnnouncementsResponse,
  type AnnouncementAudience,
  type AnnouncementStatus,
  type AppNotification,
} from '../../shared/notifications';
import { shortDate } from './format';
import s from './Lotes.module.css';
import d from './LoteDetalle.module.css';
import a from './Asistentes.module.css';
import c from './Canjes.module.css';
import u from './Usuarios.module.css';
import n from './Notas.module.css';

/**
 * Admin -> Avisos (5 oct 2026, Fase 1 del sistema de notificaciones; docs/PLAN_PENDIENTES.md §10).
 * El Admin escribe avisos que los asistentes ven en la campana de /home: para todos, o solo para una
 * zona (el domingo la sede depende de la zona). Se pueden PROGRAMAR para una hora futura y RETIRAR;
 * no se editan (se retira y se crea otro) y la fila nunca se borra. Cada alta/baja queda en Auditoría.
 */

const STATUS_FILTERS: { value: AnnouncementStatus | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'PUBLICADO', label: 'Publicados' },
  { value: 'PROGRAMADO', label: 'Programados' },
  { value: 'RETIRADO', label: 'Retirados' },
];

const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  ALL: 'Todos',
  'Zona 1': `Zona 1 (domingo: ${VENUE_21RA})`,
  'Zona 2': `Zona 2 (domingo: ${VENUE_12VA})`,
};

/** Plantillas para no empezar de cero: llenan el formulario y se pueden cambiar antes de publicar. */
const TEMPLATES: { label: string; title: string; body: string; live?: boolean }[] = [
  { label: 'En vivo ahora', title: 'Ya empezó el culto', body: 'Pasa al auditorio, ¡te esperamos!', live: true },
  { label: 'Recordatorio', title: 'En 15 minutos', body: 'Empieza la plenaria 1. Ve tomando tu lugar.' },
  { label: 'Cambio de horario', title: 'Cambio de horario', body: 'La plenaria 2 empezará a las 3:30 pm en lugar de las 3:10 pm. ¡No te la pierdas!' },
  { label: 'Aguas frescas', title: 'Aguas frescas disponibles', body: 'Canjea tu agua fresca con tu pulsera en el módulo de Salmos Café.' },
  { label: 'Aviso importante', title: 'Aviso importante', body: 'Por favor, ' },
  { label: 'Bienvenida', title: '¡Bienvenido a Arraigados 2K26!', body: 'Qué bueno tenerte aquí. Aquí te iremos avisando lo que pase durante el congreso.' },
];

const COL_CLASSES = [a.wide, undefined, undefined, undefined, d.act];

/** "2026-10-17T15:00" (hora de Tijuana, como la escribe el Admin) -> ISO UTC. */
export function tijuanaLocalToIso(local: string): string {
  const [datePart, timePart = '00:00'] = local.split('T');
  const [y, mo, da] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  const asUtc = Date.UTC(y, mo - 1, da, h, mi);
  const offsetAt = (t: number) => {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Tijuana', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
    }).formatToParts(new Date(t));
    const g = (k: string) => Number(p.find((x) => x.type === k)?.value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - t;
  };
  let t = asUtc - offsetAt(asUtc);
  t = asUtc - offsetAt(t);
  return new Date(t).toISOString();
}

export default function Avisos() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('estado') ?? '') as AnnouncementStatus | '';
  const page = Math.max(0, Number(params.get('pagina') ?? 1) - 1);
  const pageSize = parsePageSize(params.get('porPagina'));

  const [data, setData] = useState<AdminAnnouncementsResponse | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [retiring, setRetiring] = useState<AdminAnnouncementRow | null>(null);
  const seq = useRef(0);

  const update = (changes: Record<string, string>, keepPage = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
    if (!keepPage) next.delete('pagina');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const req = ++seq.current;
    setError('');
    setLoading(true);
    api
      .adminAnnouncements({ status, page, pageSize })
      .then((r) => {
        if (req !== seq.current) return;
        setData(r);
        if (r.total > 0 && r.page !== page) update({ pagina: String(r.page + 1) }, true);
      })
      .catch((err: Error) => req === seq.current && setError(err.message))
      .finally(() => req === seq.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page, pageSize, reload]);

  const sum = data?.summary;

  return (
    <AdminShell title="Avisos">
      <section className={n.kpis} aria-label="Resumen de avisos" aria-busy={!sum}>
        <Kpi label="Publicados" value={sum?.published} tone="ok" />
        <Kpi label="Programados" value={sum?.scheduled} />
        <Kpi label="Retirados" value={sum?.retired} />
      </section>

      <section className={`${d.card} ${a.filters}`} aria-label="Filtrar avisos">
        <div className={n.chipRows}>
          <div className={a.chips} role="radiogroup" aria-label="Estado del aviso">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value || 'all'}
                type="button"
                role="radio"
                aria-checked={status === f.value}
                className={`${a.chip} ${status === f.value ? a.chipOn : ''}`}
                onClick={() => update({ estado: f.value })}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Megaphone size={15} aria-hidden="true" /> Nuevo aviso
          </Button>
        </div>
      </section>

      <Examples />

      {error && (
        <div className={s.notice} role="alert">
          <p>{error}</p>
          <Button size="sm" variant="outline" onClick={() => setReload((x) => x + 1)}>
            Reintentar
          </Button>
        </div>
      )}

      <section className={d.card} aria-busy={loading}>
        <h2 className={d.cardTitle}>
          {loading ? <Skeleton w={150} h={18} /> : `${data?.total ?? 0} ${data?.total === 1 ? 'aviso' : 'avisos'}`}
        </h2>

        {!loading && !error && data && data.total === 0 && (
          <p className={s.hint}>
            {status ? 'Ningún aviso tiene ese estado.' : 'Todavía no hay avisos. Usa “Nuevo aviso” para escribir el primero; aparecerá en la campana de /home.'}
          </p>
        )}

        {(loading || (data && data.total > 0)) && (
          <div className={d.tableWrap}>
            <table className={`${d.table} ${a.table}`}>
              <thead>
                <tr>
                  <th className={a.wide}>Publicación</th>
                  <th>Aviso</th>
                  <th>Para</th>
                  <th>Estado</th>
                  <th className={d.act}>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading || !data ? (
                  <SkeletonRows classNames={COL_CLASSES} cols={['70%', '90%', 80, 80, 60]} rows={Math.min(pageSize, 5)} />
                ) : (
                  data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className={`${a.wide} ${a.date}`}>{shortDate(r.publishAt)}</td>
                      <td>
                        <b className={n.who}>{r.title}</b>{r.live && <span className={n.liveTag}>EN VIVO</span>}
                        <span className={n.text}>{r.body}</span>
                      </td>
                      <td>{r.audience === 'ALL' ? 'Todos' : r.audience}</td>
                      <td>
                        {r.status === 'PUBLICADO' && <span className={c.statusValid}>Publicado</span>}
                        {r.status === 'PROGRAMADO' && <span className={n.who}>Programado</span>}
                        {r.status === 'RETIRADO' && (
                          <span className={n.expired}>
                            Retirado
                            {r.retiredAt && <span className={c.voidMeta}>{shortDate(r.retiredAt)}</span>}
                          </span>
                        )}
                      </td>
                      <td className={d.act}>
                        {r.status !== 'RETIRADO' && (
                          <Button size="sm" variant="outline" className={c.voidBtn} onClick={() => setRetiring(r)}>
                            {r.status === 'PROGRAMADO' ? 'Cancelar' : 'Retirar'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {data && (
          <Pagination
            label="avisos"
            page={page + 1}
            pageSize={pageSize}
            total={data.total}
            disabled={loading}
            onPageChange={(p) => update({ pagina: String(p) }, true)}
            onPageSizeChange={(x) => update({ porPagina: x === 10 ? '' : String(x) })}
          />
        )}
      </section>

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            setReload((x) => x + 1);
          }}
        />
      )}
      {retiring && (
        <RetireModal
          row={retiring}
          onClose={() => setRetiring(null)}
          onDone={() => {
            setRetiring(null);
            setReload((x) => x + 1);
          }}
        />
      )}
    </AdminShell>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | undefined; tone?: 'ok' }) {
  return (
    <div className={`${n.kpi} ${tone === 'ok' ? n.kpiOk : ''}`}>
      <span className={n.kpiLabel}>{label}</span>
      {value === undefined ? <Skeleton w={44} h={26} /> : <strong className={n.kpiValue}>{value.toLocaleString('es-MX')}</strong>}
    </div>
  );
}

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('ALL');
  const [schedule, setSchedule] = useState(false);
  const [when, setWhen] = useState('');
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = title.trim() !== '' && body.trim() !== '' && (!schedule || when !== '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setError(schedule && !when ? 'Elige la fecha y hora de publicación.' : 'Escribe el título y el mensaje.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.createAnnouncement({
        title: title.trim(),
        body: body.trim(),
        audience,
        live,
        publishAt: schedule ? tijuanaLocalToIso(when) : undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el aviso. Intenta de nuevo.');
      setBusy(false);
    }
  }

  return (
    <AdminModal title="Nuevo aviso" onClose={onClose} busy={busy}>
      <form className={u.form} onSubmit={submit} noValidate>
        <div className={n.templates} role="group" aria-label="Plantillas">
          <span className={n.templatesLabel}>Plantillas</span>
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              className={n.templateBtn}
              onClick={() => {
                setTitle(t.title);
                setBody(t.body);
                setLive(t.live === true);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className={u.f}>
          <span>Título</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={ANNOUNCEMENT_TITLE_MAX} placeholder="Ej. Cambio de horario" autoFocus />
        </label>
        <div className={c.reasonBox}>
          <label className={u.f}>
            <span>Mensaje</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={ANNOUNCEMENT_BODY_MAX} placeholder="Lo que quieres que lean los asistentes." />
          </label>
          <p className={c.reasonCount}>
            {body.length}/{ANNOUNCEMENT_BODY_MAX}
          </p>
        </div>
        <label className={u.f}>
          <span>Para quién</span>
          <select className={n.fSelect} value={audience} onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}>
            {(Object.keys(AUDIENCE_LABEL) as AnnouncementAudience[]).map((k) => (
              <option key={k} value={k}>
                {AUDIENCE_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className={u.f}>
          <span>Publicación</span>
          <select className={n.fSelect} value={schedule ? 'later' : 'now'} onChange={(e) => setSchedule(e.target.value === 'later')}>
            <option value="now">Publicar ahora</option>
            <option value="later">Programar para después</option>
          </select>
        </label>
        {schedule && (
          <label className={u.f}>
            <span>Fecha y hora (hora de Tijuana)</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
        )}
        <label className={n.liveCheck}>
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          <span>Mostrar etiqueta <b>EN VIVO</b> (para algo que está pasando ahora)</span>
        </label>
        <div className={n.preview} aria-label="Vista previa">
          <span className={n.templatesLabel}>Así se verá en la campana</span>
          <ul className={n.previewList}>
            <NotificationRow
              n={{ id: 'preview', kind: 'announcement', title: title.trim() || 'Título del aviso', body: body.trim() || 'Aquí va el mensaje.', live, at: new Date().toISOString(), unread: false }}
              whenLabel="ahora"
            />
          </ul>
        </div>
        <p className={u.hint}>Un aviso no se edita: si te equivocas, retíralo y crea otro. Quedará registrado en Auditoría.</p>
        {error && (
          <p className={u.error} role="alert">
            {error}
          </p>
        )}
        <div className={u.actions}>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !canSubmit}>
            {busy ? "Guardando…" : schedule ? "Programar" : "Publicar"}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}

function RetireModal({ row, onClose, onDone }: { row: AdminAnnouncementRow; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scheduled = row.status === 'PROGRAMADO';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.retireAnnouncement(row.id);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo retirar el aviso. Intenta de nuevo.');
      setBusy(false);
    }
  }

  return (
    <AdminModal title={scheduled ? 'Cancelar aviso' : 'Retirar aviso'} onClose={onClose} busy={busy}>
      <form className={u.form} onSubmit={submit}>
        <p className={n.quote}>
          <b>{row.title}</b>
          <br />“{row.body}”
        </p>
        <p className={u.hint}>
          {scheduled ? 'No se publicará.' : 'Deja de verse en la campana de todos de inmediato.'} El aviso no se borra: queda como <b>Retirado</b> y el
          movimiento queda en Auditoría.
        </p>
        {error && (
          <p className={u.error} role="alert">
            {error}
          </p>
        )}
        <div className={u.actions}>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Volver
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Un momento…' : scheduled ? 'Cancelar aviso' : 'Retirar aviso'}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}

/** Ejemplos de cómo se ven TODAS las notificaciones de la campana (los likes salen solos). */
const EXAMPLES: { note: string; item: AppNotification; when: string }[] = [
  {
    note: 'Aviso normal',
    when: 'hoy 3:05 p.m.',
    item: { id: 'e1', kind: 'announcement', title: 'Cambio de horario', body: 'La plenaria 2 empezará a las 3:30 pm.', live: false, at: '', unread: false },
  },
  {
    note: 'Aviso "En vivo"',
    when: 'hoy 5:35 p.m.',
    item: { id: 'e2', kind: 'announcement', title: 'Ya empezó el culto', body: 'Pasa al auditorio, ¡te esperamos!', live: true, at: '', unread: false },
  },
  {
    note: 'Like a una nota (automático)',
    when: 'hoy 5:41 p.m.',
    item: { id: 'e3', kind: 'like', likerAttendeeId: 'ejemplo-ana', likerFirstName: 'Ana', count: 1, at: '', unread: false },
  },
  {
    note: 'Varios likes (automático)',
    when: 'hoy 5:50 p.m.',
    item: { id: 'e4', kind: 'like', likerAttendeeId: 'ejemplo-luis', likerFirstName: 'Luis', count: 5, at: '', unread: false },
  },
];

function Examples() {
  const [open, setOpen] = useState(false);
  return (
    <section className={d.card} aria-label="Ejemplos de notificaciones">
      <button type="button" className={n.panelHead} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Megaphone size={18} aria-hidden="true" />
        <span>Cómo se ven las notificaciones</span>
        <span className={n.panelHint}>{open ? 'Ocultar' : 'Ver ejemplos'}</span>
      </button>
      {open && (
        <div className={n.panelBody}>
          <p className={u.hint}>Así las ve el asistente en la campana de /home. Los avisos los escribes tú; los likes salen solos cuando alguien da like a su nota.</p>
          <div className={n.exampleGrid}>
            {EXAMPLES.map((e) => (
              <div key={e.item.id} className={n.example}>
                <span className={n.templatesLabel}>{e.note}</span>
                <ul className={n.previewList}>
                  <NotificationRow n={e.item} whenLabel={e.when} />
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
