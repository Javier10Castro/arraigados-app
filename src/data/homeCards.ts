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

export const CAFE_STAND = {
  /** Texto pequeño sobre el título. */
  kicker: 'Tenemos stand de café',
  /** Título grande (la marca). */
  title: 'Salmos Café',
  body: 'Pasa por tu café durante el congreso',
  /** Dónde está (opcional; vacío = no se muestra la fila). Ej.: 'Junto a la recepción'. */
  location: '',
} as const;
