import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, CupSoda, Pencil, Unlink } from 'lucide-react';
import Button from '../components/Button';
import DrinkCups from '../components/DrinkCups';
import ChurchCombobox from '../components/ChurchCombobox';
import AdminShell from './AdminShell';
import AdminModal from './AdminModal';
import HeaderDangerButton from './HeaderDangerButton';
import ReleasePulseModal from './ReleasePulseModal';
import { useStaffSession } from '../context/StaffSession';
import { api } from '../lib/api';
import UserAvatar from '../components/UserAvatar';
import { Skeleton, SkeletonRegion } from '../components/Skeleton';
import { AGE_RANGES, type AdminAttendeeDetail, type Church } from '../../shared/api';
import { PULSE_STATUS_LABEL, shortDate } from './format';
import s from './Lotes.module.css';
import d from './LoteDetalle.module.css';
import a from './Asistentes.module.css';

/**
 * Admin → Asistentes → un asistente (`/admin/asistentes/:id`).
 * - Sus datos (iglesia, presbiterio, zona, edad, registro) y "Corregir datos".
 * - Su pulsera activa (kit, lote) y las anteriores si se le reemplazó alguna.
 * - Sus aguas frescas y el historial de canjes (cuándo y qué Staff entregó).
 *
 * El nombre va en la tarjeta (no en el título en Pressio) porque Pressio no
 * tiene acentos y casi todos los nombres los llevan.
 */
export default function AsistenteDetalle() {
  const { id = '' } = useParams();
  const location = useLocation();
  const backTo = `/admin/asistentes${(location.state as { from?: string } | null)?.from ?? ''}`;
  const [att, setAtt] = useState<AdminAttendeeDetail | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const { user: me } = useStaffSession();
  const [releasing, setReleasing] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setError('');
    api
      .adminAttendee(id)
      .then(setAtt)
      .catch((err: Error) => setError(err.message));
  }, [id]);
  useEffect(load, [load]);

  const active = att?.pulses.find((p) => p.status === 'ACTIVE');
  const previous = att?.pulses.filter((p) => p.status !== 'ACTIVE') ?? [];

  return (
    <AdminShell
      title="Asistente"
      action={
        me?.isOwner && att && active ? (
          <HeaderDangerButton label="Desvincular pulsera" icon={Unlink} onClick={() => setReleasing(true)} />
        ) : undefined
      }
    >
      {releasing && att && active && (
        <ReleasePulseModal
          pulseId={active.id}
          label={active.label}
          who={att.fullName}
          onClose={() => setReleasing(false)}
          onDone={() => navigate(backTo, { replace: true })}
        />
      )}
      <Link to={backTo} className={d.back}>
        <ChevronLeft size={16} strokeWidth={2.4} /> Asistentes
      </Link>

      {error && (
        <div className={s.notice} role="alert">
          <p>{error}</p>
          <Button size="sm" variant="outline" onClick={load}>
            Reintentar
          </Button>
        </div>
      )}
      {!att && !error && (
        <SkeletonRegion label="Cargando asistente…" className={a.skeletonStack}>
          <section className={d.card}>
            <div className={a.who}>
              <Skeleton w={52} h={52} r="50%" />
              <div style={{ flex: 1 }}>
                <Skeleton w="55%" h={22} />
                <Skeleton w="30%" h={11} style={{ marginTop: 8 }} />
              </div>
            </div>
            <div className={d.facts}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i}>
                  <Skeleton w="40%" h={10} />
                  <Skeleton w="70%" h={14} style={{ marginTop: 6 }} />
                </div>
              ))}
            </div>
          </section>
          <section className={d.card}>
            <Skeleton w={120} h={16} />
            <Skeleton h={48} r={12} />
          </section>
        </SkeletonRegion>
      )}

      {att && (
        <>
          <section className={d.card}>
            <div className={a.cardHead}>
              <div className={a.who}>
                <UserAvatar className={a.whoAvatar} attendeeId={att.id} name={att.fullName} />
                <div>
                  <h2 className={a.whoName}>{att.fullName}</h2>
                  <p className={a.whoSub}>Registrado {shortDate(att.createdAt)}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil size={14} /> Corregir
              </Button>
            </div>
            {saved && (
              <p className={s.hint} role="status">
                ✓ Datos corregidos.
              </p>
            )}
            <dl className={d.facts}>
              <div>
                <dt>Iglesia</dt>
                <dd>{att.churchName}</dd>
              </div>
              <div>
                <dt>Presbiterio</dt>
                <dd>{att.presbyteryName}</dd>
              </div>
              <div>
                <dt>Zona</dt>
                <dd>{att.zoneName}</dd>
              </div>
              <div>
                <dt>Edad</dt>
                <dd>{att.ageRange ?? (att.age != null ? `${att.age} años` : '—')}</dd>
              </div>
            </dl>
          </section>

          <section className={d.card}>
            <h2 className={d.cardTitle}>Pulsera</h2>
            {active ? (
              <PulseCard pulse={active} />
            ) : (
              <p className={s.hint}>No tiene pulsera activa.</p>
            )}
            {previous.length > 0 && (
              <>
                <p className={a.subTitle}>Pulseras anteriores</p>
                {previous.map((p) => (
                  <PulseCard key={p.id} pulse={p} old />
                ))}
              </>
            )}
          </section>

          <section className={d.card}>
            <h2 className={d.cardTitle}>Aguas frescas</h2>
            {active && active.includedDrinks > 0 ? (
              <>
                <DrinkCups total={active.includedDrinks} used={active.drinksUsed} size={30} />
                <p className={s.hint}>
                  Le quedan <strong>{Math.max(active.includedDrinks - active.drinksUsed, 0)}</strong> de{' '}
                  {active.includedDrinks}.
                </p>
              </>
            ) : (
              <p className={s.hint}>Su kit no incluye aguas frescas.</p>
            )}
            {att.redemptions.length > 0 && (
              <>
                <p className={a.subTitle}>Canjes</p>
                <ul className={a.redeemList}>
                  {att.redemptions.map((r) => (
                    <li key={r.id}>
                      <CupSoda size={16} aria-hidden="true" />
                      <span>
                        Entregó <strong>{r.staffName}</strong>
                      </span>
                      <em>
                        {shortDate(r.createdAt)} · {r.pulseLabel}
                      </em>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}

      {editing && att && (
        <EditModal
          attendee={att}
          onClose={() => setEditing(false)}
          onSaved={(changed) => {
            setEditing(false);
            setSaved(changed);
            load();
          }}
        />
      )}
    </AdminShell>
  );
}

function PulseCard({ pulse, old = false }: { pulse: AdminAttendeeDetail['pulses'][number]; old?: boolean }) {
  return (
    <div className={`${a.pulse} ${old ? a.pulseOld : ''}`}>
      <span className={a.pulseCode}>{pulse.label}</span>
      <span className={`${d.status} ${d['ps_' + pulse.status.toLowerCase()]}`}>{PULSE_STATUS_LABEL[pulse.status]}</span>
      <span className={a.pulseMeta}>
        <span className={d.kit}>{pulse.packageName}</span>
        <span>
          Lote <Link to={`/admin/lotes/${pulse.batchId}`}>{pulse.batchCode}</Link>
        </span>
        {pulse.claimedAt && <span>Registrada {shortDate(pulse.claimedAt)}</span>}
        {old && <span>Reemplazada {shortDate(pulse.updatedAt)}</span>}
      </span>
    </div>
  );
}

function EditModal({
  attendee,
  onClose,
  onSaved,
}: {
  attendee: AdminAttendeeDetail;
  onClose: () => void;
  onSaved: (changed: boolean) => void;
}) {
  const [fullName, setFullName] = useState(attendee.fullName);
  const [ageRange, setAgeRange] = useState(attendee.ageRange ?? '');
  const [churchId, setChurchId] = useState(attendee.churchId);
  const [churches, setChurches] = useState<Church[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .churches()
      .then(setChurches)
      .catch((err: Error) => setError(err.message));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.updateAttendee(attendee.id, { fullName, ageRange, churchId });
      onSaved(res.changed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
      setBusy(false);
    }
  };

  return (
    <AdminModal title="Corregir datos" onClose={onClose} busy={busy}>
      <form className={a.form} onSubmit={submit} noValidate>
        <label className={a.field}>
          Nombre completo
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} autoComplete="off" />
        </label>
        <label className={a.field}>
          Edad
          <select value={ageRange} onChange={(e) => setAgeRange(e.target.value)}>
            <option value="" disabled>
              Selecciona un rango
            </option>
            {AGE_RANGES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <div className={a.field}>
          Iglesia
          {churches ? (
            <ChurchCombobox id="att-church" churches={churches} selectedId={churchId} onSelect={setChurchId} />
          ) : (
            <input value="Cargando iglesias…" readOnly />
          )}
        </div>
        <p className={a.formHint}>
          El presbiterio y la zona salen de la iglesia. El kit no se cambia aquí: para eso se reemplaza la pulsera. El
          cambio queda registrado con tu nombre.
        </p>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div className={s.actions}>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !fullName.trim() || !ageRange || !churchId}>
            {busy ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}
