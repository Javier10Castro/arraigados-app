/**
 * Perfil del asistente (7 oct 2026) -- tipos y reglas compartidos servidor/cliente.
 *
 * Tres formas de mostrar a un asistente:
 *   'photo'    foto propia (JPEG, ya recortada a cuadrado en el navegador)
 *   'avatar'   una ilustración de la galería (AVATAR_GALLERY)
 *   'initials' las iniciales de su nombre (se calculan solas: si el nombre cambia, cambian)
 * Las TRES elecciones se conservan a la vez (foto, avatar e iniciales); `kind` solo marca cuál está activa.
 * Sin fila guardada = no ha elegido: se ve el avatar automático de siempre (ajuste global del Admin).
 *
 * Los límites viven aquí para que el cliente y el servidor usen los mismos.
 */

export type ProfileKind = 'photo' | 'avatar' | 'initials';
export const PROFILE_KINDS: ProfileKind[] = ['photo', 'avatar', 'initials'];

/** Lo que ve cualquier pantalla para dibujar a una persona. `photoUrl` es una URL firmada que caduca. */
export type AttendeeProfileView = {
  /** Lo que se MUESTRA hoy (la opción activa). */
  kind: ProfileKind;
  /** Avatar elegido (galería / `c.…`). Para otras personas solo viene si es el activo. */
  avatarId: string | null;
  /** Estilo de iniciales (`i.…`); null = las de siempre. Para otras personas solo viene si es el activo. */
  initialsId: string | null;
  /** Foto (URL firmada). Para otras personas solo viene si es la activa; para uno mismo también la inactiva. */
  photoUrl: string | null;
};

/** GET /api/profile y PUT /api/profile (x-pulse-token). `profile: null` = aún no ha elegido. */
export type ProfileResponse = { profile: AttendeeProfileView | null };

/** POST /api/profiles { ids } -- solo devuelve a quienes SÍ personalizaron su perfil. */
export type ProfilesRequest = { ids: string[] };
export type ProfilesResponse = { profiles: Record<string, AttendeeProfileView> };
export const PROFILES_BATCH_MAX = 60;

/* ---- Fotos ---- */
/** Lado (px) al que el navegador reduce la foto antes de subirla. */
export const PROFILE_PHOTO_PX = 512;
/** Tope del archivo que acepta el servidor. Una foto de 512 px pesa ~50-150 KB. */
export const PROFILE_PHOTO_MAX_BYTES = 1_000_000;
/** Tope de ancho/alto que acepta el servidor (descarta imágenes gigantes o falsas). */
export const PROFILE_PHOTO_MAX_SIDE = 2048;
export const PROFILE_PHOTO_MIN_SIDE = 64;

/* ---- Galería de avatares ---- */

export type GalleryAvatar = {
  id: string;
  /** Texto para lectores de pantalla. */
  label: string;
  /** Semilla de Blobatar (la misma semilla dibuja siempre la misma figura). */
  seed: string;
  /** Tono (0-360) del color de la figura. */
  hue: number;
};

/**
 * 'own' = "el de siempre": la figura que ya se genera a partir del id del asistente
 * (semilla `attendee-<id>`, tono 225). No es una ilustración de la galería: es el
 * punto de partida que ya conocían, para poder volver a él.
 */
export const OWN_AVATAR_ID = 'own';

/**
 * Galería: para AMPLIARLA basta agregar una línea con un id nuevo (nunca cambiar ni reutilizar
 * un id ya publicado: cambiaría el avatar de quien lo eligió). El servidor valida contra esta lista.
 * Tonos: familia índigo/violeta de la marca más unos acentos cálidos.
 */
const GALLERY_HUES = [225, 250, 275, 300, 330, 355, 20, 45, 85, 140, 175, 200];
export const AVATAR_GALLERY: GalleryAvatar[] = Array.from({ length: 24 }, (_, i) => {
  const n = i + 1;
  return {
    id: `a${String(n).padStart(2, '0')}`,
    label: `Avatar ${n}`,
    seed: `arraigados-2k26-avatar-${n}`,
    hue: GALLERY_HUES[i % GALLERY_HUES.length]!,
  };
});

export const isGalleryAvatarId = (id: unknown): id is string => typeof id === 'string' && AVATAR_GALLERY.some((a) => a.id === id);
export const galleryAvatar = (id: string | null | undefined) => AVATAR_GALLERY.find((a) => a.id === id) ?? null;

/* ---- Avatar PERSONALIZADO ("Diseña el tuyo") ----
 * Se guarda como texto corto dentro de avatarId (sin columnas nuevas): `c.<rostro>.<forma>.<tono>.<claridad>`
 *   rostro   0-99    cuál de 100 caras (semilla de Blobatar)
 *   forma    0-100   silueta (Blobatar tiene 10; cada una ocupa una franja de 10)
 *   tono     0-359   color (grados)
 *   claridad 0-100   de pálido a oscuro
 * Ejemplo: `c.42.55.225.60`. El servidor lo valida con parseCustomAvatar (rangos estrictos).
 */
export type CustomAvatar = { face: number; shape: number; hue: number; tone: number };
export const CUSTOM_AVATAR_FACES = 100;
export const SHAPE_COUNT = 10;
const CUSTOM_RE = /^c\.(\d{1,2})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
export function parseCustomAvatar(id: unknown): CustomAvatar | null {
  const m = typeof id === 'string' ? CUSTOM_RE.exec(id) : null;
  if (!m) return null;
  const [face, shape, hue, tone] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as [number, number, number, number];
  if (face > CUSTOM_AVATAR_FACES - 1 || shape > 100 || hue > 359 || tone > 100) return null;
  return { face, shape, hue, tone };
}
export const customAvatarId = (c: CustomAvatar) => `c.${c.face}.${c.shape}.${c.hue}.${c.tone}`;
export const customAvatarSeed = (face: number) => `arraigados-2k26-rostro-${face}`;
/** Valor de `forma` en el centro de la silueta n (0-9). */
export const shapeCenter = (n: number) => n * 10 + 5;

export const isAvatarId = (id: unknown): id is string => id === OWN_AVATAR_ID || isGalleryAvatarId(id) || parseCustomAvatar(id) !== null;

/* ---- Iniciales PERSONALIZADAS ----
 * Sin personalizar (avatarId nulo) = primera y última palabra del nombre, como siempre.
 * Personalizadas: `i.<palabras>.<color>` -- las posiciones de las palabras del nombre que quiere usar
 * (0 = primera) separadas por guion, en orden, máximo 3; y el tono del fondo (0-359) o `x` = morado de la app.
 * Ejemplo: `i.0-2.225` = 1.ª y 3.ª palabra de su nombre. Como se guardan POSICIONES (no letras),
 * si el nombre cambia las iniciales se actualizan solas.
 */
export type InitialsStyle = { parts: number[]; hue: number | null };
export const INITIALS_MAX_PARTS = 3;
const INITIALS_RE = /^i\.([0-5](?:-[0-5]){0,2})\.(\d{1,3}|x)$/;
export function parseInitialsStyle(id: unknown): InitialsStyle | null {
  const m = typeof id === 'string' ? INITIALS_RE.exec(id) : null;
  if (!m) return null;
  const parts = m[1]!.split('-').map(Number);
  if (parts.some((p, i) => i > 0 && p <= parts[i - 1]!)) return null; // en orden y sin repetir
  const hue = m[2] === 'x' ? null : Number(m[2]);
  if (hue !== null && hue > 359) return null;
  return { parts, hue };
}
export const initialsStyleId = (s: InitialsStyle) => `i.${[...s.parts].sort((a, b) => a - b).join('-')}.${s.hue ?? 'x'}`;
/** Palabras del nombre (separadas por espacios). Solo las primeras 6 se pueden elegir. */
export const nameWords = (fullName: string) => fullName.trim().split(/\s+/).filter(Boolean).slice(0, 6);
/** Iniciales con las palabras elegidas; '' si ninguna sigue existiendo (el nombre cambió) -> usar las de siempre. */
export function customInitials(fullName: string, parts: number[]): string {
  const words = nameWords(fullName);
  return parts
    .filter((i) => i < words.length)
    .map((i) => [...words[i]!][0] ?? '')
    .join('')
    .toUpperCase();
}
/** Fondo de las iniciales personalizadas (degradado suave del tono elegido, con buen contraste con texto claro). */
export const initialsBackground = (hue: number) => `linear-gradient(135deg, hsl(${hue} 58% 40%), hsl(${(hue + 28) % 360} 62% 26%))`;
