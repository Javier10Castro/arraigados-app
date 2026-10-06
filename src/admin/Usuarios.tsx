import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Copy, KeyRound, Plus, ScanLine, ShieldCheck, Wand2 } from 'lucide-react';
import Button from '../components/Button';
import AdminShell from './AdminShell';
import AdminModal from './AdminModal';
import ConfirmTypeModal from './ConfirmTypeModal';
import { api } from '../lib/api';
import UserAvatar from '../components/UserAvatar';
import AvatarSetting from './AvatarSetting';
import Pagination from '../components/Pagination';
import { ListSkeleton } from '../components/Skeleton';
import { usePagedList } from '../lib/usePagedList';
import { useStaffSession } from '../context/StaffSession';
import type { AdminUserRow, StaffRole } from '../../shared/api';
import s from './Usuarios.module.css';

/**
 * Admin → Usuarios: cuentas de Staff y Admin (tabla "User" de Neon).
 * Reglas (las aplica el servidor; la pantalla solo las refleja):
 * - Las cuentas nuevas y los restablecimientos usan contraseña TEMPORAL; la
 *   persona debe crear la suya al entrar.
 * - Nunca se borran cuentas: se desactivan.
 * - No puedes quitarte el rol de Admin ni desactivarte; siempre queda un Admin activo.
 */

type Filter = 'all' | 'ADMIN' | 'STAFF' | 'pending' | 'off';

const FILTERS: { id: Filter; label: string; test: (u: AdminUserRow) => boolean }[] = [
  { id: 'all', label: 'Todos', test: () => true },
  { id: 'ADMIN', label: 'Admin', test: (u) => u.role === 'ADMIN' },
  { id: 'STAFF', label: 'Staff', test: (u) => u.role === 'STAFF' },
  { id: 'pending', label: 'Pendientes', test: (u) => u.active && u.pendingPassword },
  { id: 'off', label: 'Desactivadas', test: (u) => !u.active },
];

/** Contraseña temporal fácil de dictar: sin 0/O/1/I/L. */
function generateTemporaryPassword() {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const pick = (n: number) => {
    const out: string[] = [];
    const buf = new Uint8Array(1);
    while (out.length < n) {
      crypto.getRandomValues(buf);
      if (buf[0] < 248) out.push(alphabet[buf[0] % alphabet.length]); // 248 = 31 * 8, sin sesgo
    }
    return out.join('');
  };
  return `Arraigados-${pick(4)}-${pick(2)}`;
}

function stateOf(u: AdminUserRow) {
  if (!u.active) return { key: 'off', label: 'Desactivada' };
  if (u.pendingPassword) return { key: 'pending', label: 'Contraseña pendiente' };
  return { key: 'active', label: 'Activa' };
}

export default function Usuarios() {
  const { user: me } = useStaffSession();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);

  const load = useCallback(() => {
    setLoadError('');
    api
      .adminUsers()
      .then(setUsers)
      .catch((err: Error) => setLoadError(err.message));
  }, []);
  useEffect(load, [load]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, (users ?? []).filter(f.test).length])) as Record<Filter, number>,
    [users],
  );
  const visible = useMemo(() => (users ?? []).filter(FILTERS.find((f) => f.id === filter)!.test), [users, filter]);
  // Lista completa (son pocas cuentas) → filtro → orden del servidor → página de 10 en el navegador.
  const paged = usePagedList(visible, filter);

  return (
    <AdminShell
      title="Usuarios"
      action={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={15} strokeWidth={2.6} /> Nueva cuenta
        </Button>
      }
    >
      <div className={s.chips} role="tablist" aria-label="Filtrar cuentas">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={`${s.chip} ${filter === f.id ? s.chipOn : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label} {users && <span className={s.count}>{counts[f.id]}</span>}
          </button>
        ))}
      </div>

      {loadError && (
        <div className={s.notice} role="alert">
          <p>{loadError}</p>
          <Button size="sm" variant="outline" onClick={load}>
            Reintentar
          </Button>
        </div>
      )}
      {!users && !loadError && <ListSkeleton rows={4} rowClassName={s.row} label="Cargando cuentas…" />}
      {users && visible.length === 0 && <p className={s.muted}>No hay cuentas en este filtro.</p>}

      {visible.length > 0 && (
        <ul className={s.list}>
          {paged.pageItems.map((u) => {
            const st = stateOf(u);
            return (
              <li key={u.id}>
                <button type="button" className={`${s.row} ${!u.active ? s.rowOff : ''}`} onClick={() => setEditing(u)}>
                  <UserAvatar className={s.avatar} userId={u.id} name={u.name} />
                  <span className={s.body}>
                    <strong>
                      {u.name} {u.id === me?.id && <em className={s.me}>Tú</em>}
                    </strong>
                    <span>{u.email}</span>
                  </span>
                  <RoleBadge role={u.role} />
                  <span className={`${s.state} ${s['st_' + st.key]}`}>{st.label}</span>
                  <ChevronRight className={s.chev} size={18} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {visible.length > 0 && (
        <div className={s.pagerCard}>
          <Pagination
            label="cuentas"
            page={paged.page}
            pageSize={paged.pageSize}
            total={paged.total}
            onPageChange={paged.setPage}
            onPageSizeChange={paged.setPageSize}
          />
        </div>
      )}

      <AvatarSetting />

      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            load();
          }}
        />
      )}
      {editing && (
        <EditUserModal
          user={editing}
          isMe={editing.id === me?.id}
          onClose={() => setEditing(null)}
          onChanged={load}
        />
      )}
    </AdminShell>
  );
}

function RoleBadge({ role }: { role: StaffRole }) {
  return (
    <span className={`${s.role} ${role === 'ADMIN' ? s.roleAdmin : ''}`}>
      {role === 'ADMIN' ? <ShieldCheck size={13} /> : <ScanLine size={13} />}
      {role === 'ADMIN' ? 'Admin' : 'Staff'}
    </span>
  );
}

function RoleSegment({ value, onChange, disabled }: { value: StaffRole; onChange: (r: StaffRole) => void; disabled?: boolean }) {
  return (
    <div className={s.segment} role="radiogroup" aria-label="Rol">
      {(['STAFF', 'ADMIN'] as StaffRole[]).map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={value === r}
          disabled={disabled}
          className={value === r ? s.segOn : undefined}
          onClick={() => onChange(r)}
        >
          {r === 'ADMIN' ? <ShieldCheck size={15} /> : <ScanLine size={15} />} {r === 'ADMIN' ? 'Admin' : 'Staff'}
        </button>
      ))}
    </div>
  );
}

/** Credenciales para compartir (se muestran una sola vez). */
function Credentials({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Arraigados 2K26 · Staff\nCorreo: ${email}\nContraseña temporal: ${password}\nAl entrar se te pedirá crear tu propia contraseña.`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Sin portapapeles (p. ej. http fuera de localhost): el texto queda visible para copiarlo a mano.
      setCopied(false);
    }
  };
  return (
    <div className={s.creds}>
      <dl>
        <dt>Correo</dt>
        <dd>{email}</dd>
        <dt>Contraseña temporal</dt>
        <dd className={s.mono}>{password}</dd>
      </dl>
      <Button size="sm" variant="outline" onClick={() => void copy()}>
        {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copiado' : 'Copiar datos'}
      </Button>
      <p className={s.hint}>
        Compártelos por un medio de confianza. Al entrar por primera vez se le pedirá crear su propia contraseña, y esta
        temporal dejará de servir. Por seguridad no se vuelve a mostrar.
      </p>
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('STAFF');
  const [password, setPassword] = useState(generateTemporaryPassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ email: string; password: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.createUser({ name, email, role, temporaryPassword: password });
      setDone({ email: email.trim().toLowerCase(), password });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AdminModal title="Cuenta creada" onClose={onClose}>
        <Credentials email={done.email} password={done.password} />
        <Button block onClick={onClose}>
          Listo
        </Button>
      </AdminModal>
    );
  }

  return (
    <AdminModal title="Nueva cuenta" onClose={onClose} busy={busy}>
      <form className={s.form} onSubmit={submit} noValidate>
        <label className={s.f}>
          <span>Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Pedro Gómez" autoComplete="off" maxLength={80} />
        </label>
        <label className={s.f}>
          <span>Correo</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pedro@ejemplo.com"
            autoComplete="off"
            autoCapitalize="none"
          />
        </label>
        <div className={s.f}>
          <span>Rol</span>
          <RoleSegment value={role} onChange={setRole} />
          <small className={s.small}>
            {role === 'STAFF' ? 'Escanea pulseras y canjea aguas frescas.' : 'Todo lo de Staff, más el panel de Admin.'}
          </small>
        </div>
        <label className={s.f}>
          <span>Contraseña temporal</span>
          <div className={s.genRow}>
            <input value={password} onChange={(e) => setPassword(e.target.value)} className={s.mono} autoComplete="off" spellCheck={false} />
            <button type="button" className={s.gen} onClick={() => setPassword(generateTemporaryPassword())}>
              <Wand2 size={15} /> Generar
            </button>
          </div>
        </label>
        <p className={s.hint}>Al entrar por primera vez, se le pedirá crear su propia contraseña.</p>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div className={s.actions}>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !name.trim() || !email.trim() || password.length < 8}>
            {busy ? 'Creando…' : 'Crear cuenta'}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}

function EditUserModal({
  user,
  isMe,
  onClose,
  onChanged,
}: {
  user: AdminUserRow;
  isMe: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<StaffRole>(user.role);
  const [active, setActive] = useState(user.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [resetPw, setResetPw] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = name.trim() !== user.name || role !== user.role;

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await fn();
      after?.();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  if (confirmDelete) {
    return (
      <ConfirmTypeModal
        title="Eliminar cuenta"
        word="ELIMINAR"
        actionLabel="Eliminar cuenta"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await api.deleteUser(user.id);
          onChanged();
          onClose();
        }}
      >
        <p>
          Vas a eliminar la cuenta de <strong>{user.name}</strong> ({user.email}). Ya no podrá iniciar sesión y la cuenta no se puede
          recuperar. <strong>No se puede deshacer.</strong>
        </p>
        <p style={{ margin: '8px 0 0' }}>
          Si solo quieres quitarle el acceso por un tiempo, mejor <strong>desactívala</strong>. Si la cuenta ya tiene historial (lotes
          o canjes), el sistema no permitirá eliminarla.
        </p>
      </ConfirmTypeModal>
    );
  }

  if (resetDone && resetPw) {
    return (
      <AdminModal title="Contraseña restablecida" onClose={onClose}>
        <p className={s.hint}>Las sesiones abiertas de {user.name} se cerraron.</p>
        <Credentials email={user.email} password={resetPw} />
        <Button block onClick={onClose}>
          Listo
        </Button>
      </AdminModal>
    );
  }

  return (
    <AdminModal title={isMe ? 'Mi cuenta' : 'Editar cuenta'} onClose={onClose} busy={busy}>
      <div className={s.head}>
        <UserAvatar className={s.avatar} userId={user.id} name={user.name} />
        <div className={s.body}>
          <strong>{user.email}</strong>
          <span className={`${s.state} ${s['st_' + stateOf({ ...user, active }).key]}`}>{stateOf({ ...user, active }).label}</span>
        </div>
      </div>

      <label className={s.f}>
        <span>Nombre</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </label>
      <div className={s.f}>
        <span>Rol</span>
        <RoleSegment value={role} onChange={setRole} disabled={isMe} />
        {isMe && <small className={s.small}>No puedes quitarte el rol de Admin a ti mismo.</small>}
      </div>

      {saved && (
        <p className={s.ok} role="status">
          <Check size={15} /> Cambios guardados
        </p>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}

      <Button
        block
        disabled={busy || !dirty || !name.trim()}
        onClick={() => void run(() => api.updateUser(user.id, { name, role }), () => setSaved(true))}
      >
        {busy ? 'Guardando…' : 'Guardar cambios'}
      </Button>

      <section className={s.section}>
        <h3 className="label">Contraseña</h3>
        {isMe ? (
          <Button variant="outline" onClick={() => navigate('/cuenta/contrasena')}>
            <KeyRound size={15} /> Cambiar mi contraseña
          </Button>
        ) : resetPw === null ? (
          <>
            <p className={s.hint}>Si olvidó su contraseña, genera una temporal nueva. Sus sesiones abiertas se cerrarán.</p>
            <Button variant="outline" disabled={busy || !active} onClick={() => setResetPw(generateTemporaryPassword())}>
              <KeyRound size={15} /> Restablecer contraseña
            </Button>
            {!active && <small className={s.small}>Reactiva la cuenta para restablecer su contraseña.</small>}
          </>
        ) : (
          <>
            <label className={s.f}>
              <span>Nueva contraseña temporal</span>
              <div className={s.genRow}>
                <input value={resetPw} onChange={(e) => setResetPw(e.target.value)} className={s.mono} spellCheck={false} />
                <button type="button" className={s.gen} onClick={() => setResetPw(generateTemporaryPassword())}>
                  <Wand2 size={15} /> Generar
                </button>
              </div>
            </label>
            <div className={s.actions}>
              <Button variant="outline" onClick={() => setResetPw(null)} disabled={busy}>
                Cancelar
              </Button>
              <Button
                disabled={busy || resetPw.length < 8}
                onClick={() => void run(() => api.resetUserPassword(user.id, resetPw), () => setResetDone(true))}
              >
                Restablecer
              </Button>
            </div>
          </>
        )}
      </section>

      {!isMe && (
        <section className={s.section}>
          <h3 className="label">Acceso</h3>
          <p className={s.hint}>
            {active
              ? 'Al desactivarla, la cuenta pierde el acceso de inmediato. Su historial (canjes, lotes) se conserva.'
              : 'La cuenta está desactivada: no puede iniciar sesión.'}
          </p>
          <Button
            variant="outline"
            className={active ? s.dangerBtn : undefined}
            disabled={busy}
            onClick={() => void run(() => api.updateUser(user.id, { active: !active }), () => setActive(!active))}
          >
            {active ? 'Desactivar cuenta' : 'Reactivar cuenta'}
          </Button>
          {!user.protected && (
            <Button variant="outline" className={s.dangerBtn} disabled={busy} onClick={() => setConfirmDelete(true)}>
              Eliminar cuenta
            </Button>
          )}
        </section>
      )}
    </AdminModal>
  );
}
