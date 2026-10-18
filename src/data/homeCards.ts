import salmosPhoto from '../assets/brand/salmos-stand.webp';
import alfaOmegaPhoto from '../assets/brand/alfa-omega-stand.webp';

/**
 * Contenido editable de las tarjetas de /home: "Playlist" y "Stand de café".
 * Todo lo que cambia durante el congreso vive aquí; los componentes (pages/home/PlaylistCard.tsx y
 * CafeStandCard.tsx) no necesitan tocarse.
 */

export const PLAYLIST = {
  /**
   * Enlace PÚBLICO de la playlist (Spotify, Apple Music, YouTube Music...). Pégalo aquí.
   * Mientras esté vacío la tarjeta NO se muestra en producción (en `npm run dev` sí, como vista previa).
   */
  url: 'https://open.spotify.com/playlist/7nTyAnGSuuY6zQohiQUc5I',
  title: 'Playlist oficial',
  subtitle: 'La música de Arraigados 2K26: escúchala antes, durante y después del congreso.',
} as const;

export type CafeStand = {
  id: string;
  /** Texto pequeño sobre el título. */
  kicker: string;
  /** Título grande (la marca). */
  title: string;
  body: string;
  /** Sede donde está el stand (chip sobre la foto; vacío = no se muestra). */
  location: string;
  /** Foto del stand; sin foto se muestra un fondo con ícono de café. */
  photo: string | null;
  photoAlt: string;
};

/**
 * Stands de café. Por ahora /home muestra TODOS (18 oct 2026); al publicar, filtrar por sede/zona del asistente
 * (12va IAFCJ -> Salmos Café; 21ra IAFCJ -> Alfa y Omega).
 */
export const CAFE_STANDS: CafeStand[] = [
  {
    id: 'salmos',
    kicker: 'Tenemos stand de café',
    title: 'Salmos Café',
    body: 'Pasa por tu café durante el congreso',
    location: '12va IAFCJ',
    photo: salmosPhoto,
    photoAlt: 'Vaso de café helado con el sticker de Arraigados',
  },
  {
    id: 'alfa-omega',
    kicker: 'Tenemos stand de café',
    title: 'Alfa y Omega',
    body: 'Pasa por tu café durante el congreso',
    location: '21ra IAFCJ',
    photo: alfaOmegaPhoto, // PROVISIONAL: foto de prueba (matcha); cambiar por la oficial cuando llegue
    photoAlt: 'Matcha fresa de Alfa y Omega Café',
  },
];
