import { useEffect, useState } from 'react';
import BloBatar from './BloBatar';
import { useAppSettings } from '../context/AppSettings';
import { useProfile } from '../context/ProfileDirectory';
import {
  OWN_AVATAR_ID,
  customAvatarSeed,
  customInitials,
  galleryAvatar,
  initialsBackground,
  parseCustomAvatar,
  parseInitialsStyle,
  type AttendeeProfileView,
} from '../../shared/profile';
import type { AvatarMode } from '../../shared/api';
import { initials } from '../context/PulseSession';
import { attendeeAvatarSeed, userAvatarSeed, FALLBACK_AVATAR_SEED } from '../lib/avatar';
import styles from './UserAvatar.module.css';

/**
 * ÚNICO componente de avatar de personas en toda la app.
 *
 *   1. si la persona ELIGIÓ su perfil (tabla AttendeeProfile, ver context/ProfileDirectory.tsx):
 *        → 'photo'     → su foto (URL firmada)
 *        → 'avatar'    → una ilustración de la galería (shared/profile.ts)
 *        → 'initials'  → initials(name)
 *   2. si no (o es una cuenta de Staff/Admin), configuración global (AppSettings.avatarMode):
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
 * - `profile`: fuerza un perfil (solo la vista previa de /perfil, antes de guardar).
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
  profile?: AttendeeProfileView | null;
};

export default function UserAvatar({ name, userId, attendeeId, size, className, label, title, mode, profile: forced }: Props) {
  const { avatarMode: globalMode } = useAppSettings();
  const saved = useProfile(userId ? null : attendeeId);
  const [photoBroken, setPhotoBroken] = useState(false);
  // Un modo forzado (vista previa de Admin) manda sobre todo; si no, la elección de la persona; si no, el ajuste global.
  const chosen = mode ? null : (forced ?? saved);
  const avatarMode = mode ?? (chosen?.kind === 'initials' ? 'initials' : globalMode);
  const photoUrl = chosen?.photoUrl ?? null;
  useEffect(() => setPhotoBroken(false), [photoUrl]); // una foto nueva vuelve a intentarse
  const displayName = name?.trim() ?? '';
  const px = size ?? (className ? undefined : 40);
  const style = px ? { width: px, height: px, fontSize: Math.round(px * 0.4) } : undefined;
  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const };

  if (chosen?.kind === 'photo' && chosen.photoUrl && !photoBroken) {
    return (
      <span className={`${styles.root} ${styles.photo}${className ? ` ${className}` : ''}`} style={style} title={title} {...a11y}>
        <img src={chosen.photoUrl} alt="" draggable={false} onError={() => setPhotoBroken(true)} />
      </span>
    );
  }

  // Foto rota (URL vencida o archivo ya borrado): se ve como si no hubiera elegido, nunca un ícono roto.
  if (chosen?.kind === 'avatar' || (chosen?.kind === 'photo' && photoBroken)) {
    const custom = chosen.kind === 'avatar' ? parseCustomAvatar(chosen.avatarId) : null;
    if (custom) {
      return (
        <span className={`${styles.root} ${styles.blob}${className ? ` ${className}` : ''}`} style={style} title={title} {...a11y}>
          <BloBatar name={customAvatarSeed(custom.face)} hue={custom.hue} shape={custom.shape / 100} tone={custom.tone / 100} size={px ?? 40} className={styles.svg} />
        </span>
      );
    }
    const pick = chosen.kind === 'avatar' ? galleryAvatar(chosen.avatarId) : null;
    if (pick) {
      return (
        <span className={`${styles.root} ${styles.blob}${className ? ` ${className}` : ''}`} style={style} title={title} {...a11y}>
          <BloBatar name={pick.seed} hue={pick.hue} size={px ?? 40} className={styles.svg} />
        </span>
      );
    }
    // 'own' (el de siempre) y respaldo: la figura de su propio id, sin importar el ajuste global.
    if (chosen.avatarId === OWN_AVATAR_ID && attendeeId) {
      return (
        <span className={`${styles.root} ${styles.blob}${className ? ` ${className}` : ''}`} style={style} title={title} {...a11y}>
          <BloBatar name={attendeeAvatarSeed(attendeeId)} size={px ?? 40} className={styles.svg} />
        </span>
      );
    }
  }

  if (chosen?.kind === 'initials' && chosen.initialsId) {
    // Iniciales personalizadas: palabras del nombre elegidas por la persona + color de fondo.
    const st = parseInitialsStyle(chosen.initialsId);
    const text = st ? customInitials(displayName, st.parts) : '';
    if (st && text) {
      const small = text.length > 2 && px ? { fontSize: Math.round(px * 0.32) } : {};
      const bg = st.hue === null ? {} : { background: initialsBackground(st.hue), color: '#fff' };
      return (
        <span className={`${styles.root} ${styles.initials}${className ? ` ${className}` : ''}`} style={{ ...style, ...small, ...bg }} title={title} {...a11y}>
          {text}
        </span>
      );
    }
  }

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
