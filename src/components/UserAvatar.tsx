import BloBatar from './BloBatar';
import { useAppSettings } from '../context/AppSettings';
import type { AvatarMode } from '../../shared/api';
import { initials } from '../context/PulseSession';
import { attendeeAvatarSeed, userAvatarSeed, FALLBACK_AVATAR_SEED } from '../lib/avatar';
import styles from './UserAvatar.module.css';

/**
 * ÚNICO componente de avatar de personas en toda la app.
 *
 *   configuración global (AppSettings.avatarMode)
 *        → 'blobatar'  → <BloBatar>  (src/components/BloBatar.tsx, fondo transparente)
 *        → 'initials'  → initials(name)  (la función de siempre, PulseSession.tsx)
 *
 * Ninguna pantalla decide el modo: todas usan <UserAvatar>.
 *
 * Props:
 * - `name`: nombre de la persona (iniciales y respaldo de la semilla).
 * - `userId`: id de "User" (Staff/Admin) → semilla `user-<id>`.
 * - `attendeeId`: id de "Attendee" → semilla `attendee-<id>`.
 *   Con id el Blobatar no cambia aunque se corrija el nombre.
 * - `size`: px. Si se omite, lo pone `className`; sin ninguno, 40 px.
 * - `className`: el círculo de cada pantalla (tamaño, color, tipografía).
 * - `mode`: fuerza un modo. SOLO para la vista previa de la configuración
 *   (Admin → Usuarios); las pantallas normales nunca lo pasan.
 * - `label`: texto para lectores de pantalla. Sin él el avatar es decorativo
 *   (aria-hidden), que es lo correcto cuando el nombre está al lado.
 */
type Props = {
  name?: string | null;
  userId?: string | null;
  attendeeId?: string | null;
  size?: number;
  className?: string;
  label?: string;
  title?: string;
  mode?: AvatarMode;
};

export default function UserAvatar({ name, userId, attendeeId, size, className, label, title, mode }: Props) {
  const { avatarMode: globalMode } = useAppSettings();
  const avatarMode = mode ?? globalMode;
  const displayName = name?.trim() ?? '';
  const px = size ?? (className ? undefined : 40);
  const style = px ? { width: px, height: px, fontSize: Math.round(px * 0.4) } : undefined;
  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const };

  if (avatarMode === 'initials') {
    return (
      <span className={`${styles.root} ${styles.initials}${className ? ` ${className}` : ''}`} style={style} title={title} {...a11y}>
        {initials(displayName)}
      </span>
    );
  }

  const seed = userId ? userAvatarSeed(userId) : attendeeId ? attendeeAvatarSeed(attendeeId) : displayName || FALLBACK_AVATAR_SEED;
  return (
    <span className={`${styles.root} ${styles.blob}${className ? ` ${className}` : ''}`} style={style} title={title} {...a11y}>
      <BloBatar name={seed} size={px ?? 40} className={styles.svg} />
    </span>
  );
}
