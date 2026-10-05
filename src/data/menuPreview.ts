import tacosImg from '../assets/img/tacos.webp';
import polloImg from '../assets/img/pollo.webp';
import pastaImg from '../assets/img/pasta.webp';
import aguasImg from '../assets/img/aguas.webp';
import hamburguesaImg from '../assets/img/hamburguesa.webp';
import hotdogImg from '../assets/img/hotdog.webp';
import papasImg from '../assets/img/papas.webp';
import nachosImg from '../assets/img/nachos.webp';

/**
 * Datos MOCK para /menu-preview (3 oct 2026) -- propuesta visual aislada del
 * Menú de alimentos. NO son el menú definitivo del Congreso ni tocan
 * foodDays/foodMenu (los datos reales de /comida, sin cambios).
 *
 * Las 8 fotos son reales: 4 ya existían en el proyecto (pollo/tacos/pasta/
 * aguas.webp) y 4 se agregaron el 3 oct 2026 (hamburguesa/hotdog/papas/
 * nachos.webp, fotografías de Pixabay con licencia Pixabay Content License --
 * uso comercial libre, sin atribución requerida -- aprobadas por Javier antes
 * de incorporarse). Todas se muestran igual: rectángulo con esquinas
 * redondeadas, object-fit: cover (sin máscara/recorte orgánico).
 */

export type MenuPreviewItem = {
  id: string;
  name: string;
  description: string;
  /** Centavos, igual que el resto de la app -- se formatea con formatPrice(). */
  price: number;
  available: boolean;
  venue: string;
  /** Foto real importada. */
  image: string;
};

export const MENU_VENUES = {
  DOCE: '12va IAFCJ',
  VEINTIUNA: '21ra IAFCJ',
} as const;

export const menuPreviewItems: MenuPreviewItem[] = [
  {
    id: 'tacos-asada',
    name: 'Tacos de Asada',
    description: 'Tortilla de maíz, carne asada, cebolla, cilantro y salsa al gusto. Servidos en orden de 3.',
    price: 8500,
    available: true,
    venue: MENU_VENUES.DOCE,
    image: tacosImg,
  },
  {
    id: 'pollo-plancha',
    name: 'Pollo a la Plancha',
    description: 'Pechuga de pollo a la plancha con arroz, ensalada fresca y aderezo de la casa.',
    price: 9500,
    available: true,
    venue: MENU_VENUES.DOCE,
    image: polloImg,
  },
  {
    id: 'pasta-alfredo',
    name: 'Pasta Alfredo',
    description: 'Fettuccine en salsa Alfredo cremosa, con pan de ajo recién horneado.',
    price: 9000,
    available: true,
    venue: MENU_VENUES.VEINTIUNA,
    image: pastaImg,
  },
  {
    id: 'aguas-frescas',
    name: 'Aguas Frescas',
    description: 'Horchata o jamaica preparadas en casa, bien frías. Pregunta el sabor disponible.',
    price: 3500,
    available: true,
    venue: MENU_VENUES.DOCE,
    image: aguasImg,
  },
  {
    id: 'hamburguesa',
    name: 'Hamburguesa',
    description: 'Carne 100% de res, queso amarillo, lechuga, tomate y nuestra salsa especial, en pan brioche.',
    price: 9800,
    available: true,
    venue: MENU_VENUES.VEINTIUNA,
    image: hamburguesaImg,
  },
  {
    id: 'hot-dog',
    name: 'Hot Dog',
    description: 'Salchicha estilo Sonora envuelta en tocino, con frijoles, cebolla, tomate y mostaza.',
    price: 7000,
    available: true,
    venue: MENU_VENUES.DOCE,
    image: hotdogImg,
  },
  {
    id: 'papas-preparadas',
    name: 'Papas Preparadas',
    description: 'Papa a la francesa con queso, tocino, crema y salsa al gusto.',
    price: 6500,
    available: false,
    venue: MENU_VENUES.VEINTIUNA,
    image: papasImg,
  },
  {
    id: 'nachos',
    name: 'Nachos',
    description: 'Totopos horneados con queso gratinado, frijoles, jalapeños y pico de gallo.',
    price: 7500,
    available: true,
    venue: MENU_VENUES.DOCE,
    image: nachosImg,
  },
];
