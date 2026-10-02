import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import UserAvatar from '../components/UserAvatar';
import { useAppSettings } from '../context/AppSettings';
import { useStaffSession } from '../context/StaffSession';
import type { AvatarMode } from '../../shared/api';
import s from './AvatarSetting.module.css';

/**
 * Admin → Usuarios → "Apariencia de usuarios": configuración GLOBAL del
 * avatar (Blobatar o iniciales) para toda la app. No hay pantalla de
 * configuración general, así que vive en Usuarios (decisión del 1 oct 2026).
 * El servidor solo acepta el cambio de un ADMIN (PATCH /api/admin/settings).
 */
const OPTIONS: { value: AvatarMode; label: string; hint: string }[] = [
  { value: 'blobatar', label: 'Blobatar', hint: 'Figura única para cada persona' },
  { value: 'initials', label: 'Iniciales', hint: 'Letras del nombre, como antes' },
];

export default function AvatarSetting() {
  const { avatarMode, setAvatarMode } = useAppSettings();
  const { user } = useStaffSession();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (status?.kind !== 'ok') return;
    const t = window.setTimeout(() => setStatus(null), 2500);
    return () => window.clearTimeout(t);
  }, [status]);

  const choose = async (mode: AvatarMode) => {
    if (mode === avatarMode || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      await setAvatarMode(mode);
      setStatus({ kind: 'ok', text: 'Guardado. Los avatares se actualizaron en toda la app.' });
    } catch (err) {
      setStatus({ kind: 'error', text: (err as Error).message || 'No se pudo guardar.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={s.card} aria-labelledby="avatar-setting-title">
      <div className={s.head}>
        <h2 id="avatar-setting-title" className={s.title}>
          Apariencia de usuarios
        </h2>
        <p className={s.desc}>Elige cómo se muestran los avatares de las personas en toda la aplicación.</p>
      </div>

      <div className={s.options} role="radiogroup" aria-label="Avatar de usuarios">
        {OPTIONS.map((o) => {
          const on = avatarMode === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={busy}
              className={`${s.option} ${on ? s.optionOn : ''}`}
              onClick={() => void choose(o.value)}
            >
              <span className={s.radio} aria-hidden="true">
                {on && <Check size={13} strokeWidth={3} />}
              </span>
              <PreviewAvatar mode={o.value} userId={user?.id} name={user?.name} />
              <span className={s.text}>
                <strong>{o.label}</strong>
                <span>{o.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <p className={`${s.status} ${status?.kind === 'error' ? s.error : ''}`} role="status" aria-live="polite">
        {busy ? 'Guardando…' : status?.text ?? ''}
      </p>
    </section>
  );
}

/**
 * Vista previa de cada opción con TU propio avatar. Es la única excepción a
 * "el modo lo decide la configuración": aquí se fuerza cada modo para que el
 * Admin vea las dos opciones antes de elegir.
 */
function PreviewAvatar({ mode, userId, name }: { mode: AvatarMode; userId?: string; name?: string }) {
  return (
    <span className={s.preview}>
      <UserAvatar className={s.previewAvatar} userId={userId} name={name} mode={mode} />
    </span>
  );
}
