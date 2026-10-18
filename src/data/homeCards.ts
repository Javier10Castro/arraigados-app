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
  url: '',
  title: 'Playlist oficial',
  subtitle: 'La música de Arraigados 2K26: escúchala antes, durante y después del congreso.',
} as const;

export const CAFE_STAND = {
  /** Nombre que se muestra como marca. */
  brand: 'Salmos Café',
  title: 'Tenemos stand de café',
  body: 'Pasa por tu café durante el congreso y canjea tus aguas frescas con tu pulsera.',
  /** Dónde está (opcional; vacío = no se muestra la fila). Ej.: 'Junto a la recepción'. */
  location: '',
  /**
   * Ruta del logo (opcional). Copia el archivo a `public/rcs/` y pon p. ej. '/rcs/salmos-cafe.svg'.
   * Vacío = se muestra la marca en texto con un ícono de taza.
   */
  logo: '',
} as const;
