import polloImg from '../assets/img/pollo.webp';
import tacosImg from '../assets/img/tacos.webp';
import pastaImg from '../assets/img/pasta.webp';
import aguasImg from '../assets/img/aguas.webp';
import adoracionImg from '../assets/img/adoracion.webp';
import multitudImg from '../assets/img/multitud.webp';
import type { PackageSummary } from '../../shared/api';

export type EventItem = {
  id: string;
  kind: string;
  title: string;
  venue: string;
  time: string;
};

/** Nombres oficiales de las sedes (ver docs/CLAUDE_HANDOFF.md §39). */
export const VENUE_12VA = '12va IAFCJ';
export const VENUE_21RA = '21ra IAFCJ';

/** Enlace de Google Maps de cada sede, para el botón "Obtener ubicación". */
export const VENUE_MAPS: Record<string, string> = {
  [VENUE_12VA]: 'https://maps.app.goo.gl/QUZyURtokMFypqbm7',
  [VENUE_21RA]: 'https://maps.app.goo.gl/BrbmyHxRqpeg1W3Y6',
};

export const nowEvent = {
  kind: 'PLENARIA',
  title: 'ARRAIGADOS EN CRISTO.',
  venue: VENUE_12VA,
  time: '10:30 - 12:00',
  live: true,
};

export const upcomingEvents: EventItem[] = [
  { id: 'culto', kind: 'Culto', title: 'Culto de Apertura', venue: VENUE_21RA, time: '16:30 - 18:00' },
  { id: 'receso', kind: 'Receso', title: 'Receso', venue: 'Ambas sedes', time: '18:00 - 18:30' },
];

export type ScheduleDay = {
  id: string;
  label: string;
  long: string;
  events: EventItem[];
  empty?: string;
};

/**
 * Fechas oficiales del congreso: sábado 17 y domingo 18 de octubre de 2026
 * (coincide con EVENT_DAYS en shared/api.ts, usado por el Dashboard). Antes
 * decía "vie17"/"sab18", lo que implicaba 17 = viernes y 18 = sábado.
 */
export const schedule: ScheduleDay[] = [
  {
    id: 'sab17',
    label: 'SÁB 17',
    long: 'Sábado 17 de octubre',
    events: [
      { id: 'plenaria', kind: 'Plenaria', title: 'Arraigados en Cristo.', venue: VENUE_12VA, time: '10:30 - 12:00' },
      { id: 'culto', kind: 'Culto', title: 'Culto de Apertura', venue: VENUE_21RA, time: '16:30 - 18:00' },
      { id: 'receso', kind: 'Receso', title: 'Receso', venue: 'Ambas sedes', time: '18:00 - 18:30' },
    ],
  },
  {
    id: 'dom18',
    label: 'DOM 18',
    long: 'Domingo 18 de octubre',
    events: [],
    empty: 'El programa del domingo se comparte desde el escenario. Pregunta en tu zona.',
  },
];


export const foodDays = [
  { id: 'sede12', label: 'Sede 12va' },
  { id: 'sede21', label: 'Sede 21ra' },
];

export const foodMenu = [
  { id: 'pollo', name: 'Pollo a la plancha', desc: 'Con arroz y ensalada', img: polloImg },
  { id: 'tacos', name: 'Tacos de res', desc: 'Con salsa y limón', img: tacosImg },
  { id: 'pasta', name: 'Pasta Alfredo', desc: 'Con pan de ajo', img: pastaImg },
  { id: 'aguas', name: 'Aguas frescas', desc: 'Horchata / Jamaica', img: aguasImg },
];

export const stories = [
  {
    id: 's1',
    quote: 'Dios está haciendo algo en nosotros',
    author: 'Red Juvenil TJ',
    meta: 'Sede 12va  |  8:43 PM',
    photo: 'worship',
    img: adoracionImg,
  },
  {
    id: 's2',
    quote: 'No es solo un congreso, es una llamada.',
    author: 'Red Juvenil TJ',
    meta: 'Sede 21ra  |  9:10 PM',
    photo: 'crowd',
    img: multitudImg,
  },
];

/** Información pública del congreso (pantalla /conocer). */
export const eventInfo = {
  dates: '17 y 18 de octubre',
  datesDetail: 'Sábado y Domingo',
  venues: `${VENUE_12VA} y ${VENUE_21RA}`,
  city: 'Tijuana, B.C.',
  organizer: 'Red Juvenil Tijuana',
  verseText: 'Por tanto, de la manera que habéis recibido al Señor Jesucristo, andad en él',
  verseRef: 'Colosenses 2:6 - 7',
};

/** Cómo se llama en pantalla lo que se canjea con Staff (Pulse.drinksUsed). */
export const DRINK_LABEL = 'aguas frescas';

/**
 * Contenido fijo de cada paquete, ligado al NOMBRE EXACTO del paquete en Neon
 * (tabla "Package"). Precio y número de bebidas NO van aquí: vienen de Neon.
 * Si en el admin del Next.js se crea o renombra un paquete, hay que agregarlo
 * aquí; mientras tanto ese paquete se muestra solo con precio y bebidas.
 */
export const packageContent: Record<string, string[]> = {
  'Kit - A': ['Botella de agua', 'Rifa categoría 1'],
  'Kit - B': ['Bote personalizado', 'Botella de agua', 'Rifa categoría 2'],
  Especial: [
    'Bote personalizado',
    'Tote bag',
    'Botella de agua',
    '1 entrada (acceso general al congreso)',
    '2 stickers',
    'Rifa especial',
  ],
};

export type { PackageSummary };

/**
 * RESPALDO: valores de Neon al 30 sep 2026 (precio en centavos). La pantalla
 * pública /conocer los usa solo mientras carga /api/packages o si falla la
 * conexión. La fuente real es la tabla "Package" -- no editar aquí para
 * "cambiar" un paquete.
 */
export const packagesPreview: PackageSummary[] = [
  { name: 'Kit - A', price: 10000, includedDrinks: 0 },
  { name: 'Kit - B', price: 15000, includedDrinks: 3 },
  { name: 'Especial', price: 20000, includedDrinks: 3 },
];

export function formatPrice(cents: number) {
  return `$${(cents / 100).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;
}

/** Lista final que se muestra: contenido fijo + bebidas (de Neon) al final. */
export function packageItems(pkg: PackageSummary): string[] {
  const items = [...(packageContent[pkg.name] ?? [])];
  if (pkg.includedDrinks > 0) items.push(`${pkg.includedDrinks} ${DRINK_LABEL}`);
  return items;
}

// Rangos de edad: ver shared/api.ts (AGE_RANGES), compartidos con el servidor.
