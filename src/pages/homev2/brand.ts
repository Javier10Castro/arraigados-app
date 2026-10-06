/**
 * Marca del congreso para la experiencia /homev2 (portada de HangingCards /try).
 * Todos los recursos ya viven en public/rcs/ (los mismos que usa el resto de la app).
 * `viewBox` recorta el margen transparente de cada SVG sin alterar el arte.
 */
export type Artwork = { src: string; viewBox: string; sourceWidth: number; sourceHeight: number };

const RCS = '/rcs/svg_editables';

export const brand = {
  organization: 'Red Juvenil Tijuana',
  eventMark: 'CONG 2K26',
  edition: '#AC2K26',
  assets: {
    arraigadosCream: { src: `${RCS}/LogoBage.svg`, viewBox: '176 786 1653 603', sourceWidth: 2048, sourceHeight: 2048 } as Artwork,
    congresoCream: { src: `${RCS}/CONG2026k_Bage.svg`, viewBox: '215 899 1557 281', sourceWidth: 2048, sourceHeight: 2048 } as Artwork,
    /** Wordmark "Congreso Distrital 2K26" (PNG cuadrado 4500x4500 cuyo arte ocupa una franja). */
    marcaCongreso: { src: '/rcs/hc/marca-congreso.png', viewBox: '459 1976 3438 621', sourceWidth: 4500, sourceHeight: 4500 } as Artwork,
    rjdtCream: `${RCS}/RJDT_CIRCLES_LOGO.svg`,
    rjdtArtwork: { src: `${RCS}/RJDT_CIRCLES_LOGO.svg`, viewBox: '0 0 603 148', sourceWidth: 603, sourceHeight: 148 } as Artwork,
  },
  verse: {
    image: `${RCS}/Cita_Beige.svg`,
    alt: 'Cita bíblica del Congreso Arraigados 2K26',
    width: 1438,
    height: 269,
    ratio: 1438 / 269,
  },
  strap: '#111116',
  strapEdge: '#2b2b32',
};

/** Variables de color de la credencial (se inyectan como estilo inline en la raíz). */
export const brandTheme: Record<string, string> = {
  '--congreso-purple': '#3e07a6',
  '--congreso-deep': '#120750',
  '--congreso-violet': '#320890',
  '--congreso-cream': '#f2f7d7',
  '--congreso-paper': '#f4f1e9',
  '--congreso-lavender': '#c0b8df',
  '--congreso-ink': '#16114c',
  '--congreso-strap': '#111116',
  '--congreso-strap-edge': '#2b2b32',
};
