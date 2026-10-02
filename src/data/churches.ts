/**
 * Directorio oficial de iglesias de la Red Juvenil Tijuana
 * (fuente: Iglesias_Presbiterios_y_Zonas.xlsx — 109 iglesias, 26 presbiterios, 2 zonas).
 *
 * Para cambiar el directorio (iglesia nueva, presbiterio reasignado) basta con
 * editar RAW_CHURCHES. La ciudad NO se captura: se calcula con deriveCity().
 */

export type City = 'Tijuana' | 'Rosarito' | 'Tecate' | 'Otra';

export type Church = {
  id: string;
  name: string;
  presbyteryName: string;
  zoneName: string;
  city: City;
};

const RAW_CHURCHES: Omit<Church, 'city'>[] = [
  { id: "3ra-iglesia-tijuana", name: "3ra Iglesia Tijuana", presbyteryName: "3ra Tijuana", zoneName: "Zona 1" },
  { id: "22da-iglesia-tijuana", name: "22da Iglesia Tijuana", presbyteryName: "3ra Tijuana", zoneName: "Zona 1" },
  { id: "71ra-iglesia-tijuana", name: "71ra Iglesia Tijuana", presbyteryName: "3ra Tijuana", zoneName: "Zona 1" },
  { id: "1ra-iglesia-tijuana", name: "1ra Iglesia Tijuana", presbyteryName: "5ta Tijuana", zoneName: "Zona 1" },
  { id: "5ta-iglesia-tijuana", name: "5ta Iglesia Tijuana", presbyteryName: "5ta Tijuana", zoneName: "Zona 1" },
  { id: "72da-iglesia-tijuana", name: "72da Iglesia Tijuana", presbyteryName: "5ta Tijuana", zoneName: "Zona 1" },
  { id: "79na-iglesia-tijuana", name: "79na Iglesia Tijuana", presbyteryName: "5ta Tijuana", zoneName: "Zona 1" },
  { id: "6ta-iglesia-tijuana", name: "6ta Iglesia Tijuana", presbyteryName: "6ta Tijuana", zoneName: "Zona 1" },
  { id: "26ta-iglesia-tijuana", name: "26ta Iglesia Tijuana", presbyteryName: "6ta Tijuana", zoneName: "Zona 1" },
  { id: "58va-iglesia-tijuana", name: "58va Iglesia Tijuana", presbyteryName: "6ta Tijuana", zoneName: "Zona 1" },
  { id: "75ta-iglesia-tijuana", name: "75ta Iglesia Tijuana", presbyteryName: "6ta Tijuana", zoneName: "Zona 1" },
  { id: "7ma-iglesia-tijuana", name: "7ma Iglesia Tijuana", presbyteryName: "7ma Tijuana", zoneName: "Zona 1" },
  { id: "18va-iglesia-tijuana", name: "18va Iglesia Tijuana", presbyteryName: "7ma Tijuana", zoneName: "Zona 1" },
  { id: "campo-4-tijuana", name: "Campo 4 Tijuana", presbyteryName: "7ma Tijuana", zoneName: "Zona 1" },
  { id: "campo-6-tijuana", name: "Campo 6 Tijuana", presbyteryName: "7ma Tijuana", zoneName: "Zona 1" },
  { id: "8va-iglesia-tijuana", name: "8va Iglesia Tijuana", presbyteryName: "8va Tijuana", zoneName: "Zona 1" },
  { id: "32da-iglesia-tijuana", name: "32da Iglesia Tijuana", presbyteryName: "8va Tijuana", zoneName: "Zona 1" },
  { id: "46ta-iglesia-tijuana", name: "46ta Iglesia Tijuana", presbyteryName: "8va Tijuana", zoneName: "Zona 1" },
  { id: "campo-7-tijuana", name: "Campo 7 Tijuana", presbyteryName: "8va Tijuana", zoneName: "Zona 1" },
  { id: "penal-el-hongo", name: "Penal El Hongo", presbyteryName: "8va Tijuana", zoneName: "Zona 1" },
  { id: "9na-iglesia-tijuana", name: "9na Iglesia Tijuana", presbyteryName: "9na Tijuana", zoneName: "Zona 1" },
  { id: "13va-iglesia-tijuana", name: "13va Iglesia Tijuana", presbyteryName: "9na Tijuana", zoneName: "Zona 1" },
  { id: "53ra-iglesia-tijuana", name: "53ra Iglesia Tijuana", presbyteryName: "9na Tijuana", zoneName: "Zona 1" },
  { id: "76ta-iglesia-tijuana", name: "76ta Iglesia Tijuana", presbyteryName: "9na Tijuana", zoneName: "Zona 1" },
  { id: "10ma-iglesia-tijuana", name: "10ma Iglesia Tijuana", presbyteryName: "10ma Tijuana", zoneName: "Zona 2" },
  { id: "17ma-iglesia-tijuana", name: "17ma Iglesia Tijuana", presbyteryName: "10ma Tijuana", zoneName: "Zona 2" },
  { id: "40ma-iglesia-tijuana", name: "40ma Iglesia Tijuana", presbyteryName: "10ma Tijuana", zoneName: "Zona 2" },
  { id: "56ta-iglesia-tijuana", name: "56ta Iglesia Tijuana", presbyteryName: "10ma Tijuana", zoneName: "Zona 2" },
  { id: "83ra-iglesia-tijuana", name: "83ra Iglesia Tijuana", presbyteryName: "10ma Tijuana", zoneName: "Zona 2" },
  { id: "84ta-iglesia-tijuana", name: "84ta Iglesia Tijuana", presbyteryName: "10ma Tijuana", zoneName: "Zona 2" },
  { id: "2da-iglesia-tijuana", name: "2da Iglesia Tijuana", presbyteryName: "11va Tijuana", zoneName: "Zona 1" },
  { id: "4ta-iglesia-tijuana", name: "4ta Iglesia Tijuana", presbyteryName: "11va Tijuana", zoneName: "Zona 1" },
  { id: "11va-iglesia-tijuana", name: "11va Iglesia Tijuana", presbyteryName: "11va Tijuana", zoneName: "Zona 1" },
  { id: "31ra-iglesia-tijuana", name: "31ra Iglesia Tijuana", presbyteryName: "11va Tijuana", zoneName: "Zona 1" },
  { id: "12va-iglesia-tijuana", name: "12va Iglesia Tijuana", presbyteryName: "12va Tijuana", zoneName: "Zona 2" },
  { id: "34ta-iglesia-tijuana", name: "34ta Iglesia Tijuana", presbyteryName: "12va Tijuana", zoneName: "Zona 2" },
  { id: "47ma-iglesia-tijuana", name: "47ma Iglesia Tijuana", presbyteryName: "12va Tijuana", zoneName: "Zona 2" },
  { id: "73ra-iglesia-tijuana", name: "73ra Iglesia Tijuana", presbyteryName: "12va Tijuana", zoneName: "Zona 2" },
  { id: "14va-iglesia-tijuana", name: "14va Iglesia Tijuana", presbyteryName: "14va Tijuana", zoneName: "Zona 2" },
  { id: "15va-iglesia-tijuana", name: "15va Iglesia Tijuana", presbyteryName: "14va Tijuana", zoneName: "Zona 2" },
  { id: "67ma-iglesia-tijuana", name: "67ma Iglesia Tijuana", presbyteryName: "14va Tijuana", zoneName: "Zona 2" },
  { id: "81ra-iglesia-tijuana", name: "81ra Iglesia Tijuana", presbyteryName: "14va Tijuana", zoneName: "Zona 2" },
  { id: "campo-8-tijuana", name: "Campo 8 Tijuana", presbyteryName: "14va Tijuana", zoneName: "Zona 2" },
  { id: "16va-iglesia-tijuana", name: "16va Iglesia Tijuana", presbyteryName: "16va Tijuana", zoneName: "Zona 2" },
  { id: "35ta-iglesia-tijuana", name: "35ta Iglesia Tijuana", presbyteryName: "16va Tijuana", zoneName: "Zona 2" },
  { id: "77ma-iglesia-tijuana", name: "77ma Iglesia Tijuana", presbyteryName: "16va Tijuana", zoneName: "Zona 2" },
  { id: "82da-iglesia-tijuana", name: "82da Iglesia Tijuana", presbyteryName: "16va Tijuana", zoneName: "Zona 2" },
  { id: "19na-iglesia-tijuana", name: "19na Iglesia Tijuana", presbyteryName: "19na Tijuana", zoneName: "Zona 2" },
  { id: "57ta-iglesia-tijuana", name: "57ta Iglesia Tijuana", presbyteryName: "19na Tijuana", zoneName: "Zona 2" },
  { id: "63ra-iglesia-tijuana", name: "63ra Iglesia Tijuana", presbyteryName: "19na Tijuana", zoneName: "Zona 2" },
  { id: "20ma-iglesia-tijuana", name: "20ma Iglesia Tijuana", presbyteryName: "20ma Tijuana", zoneName: "Zona 2" },
  { id: "36ta-iglesia-tijuana", name: "36ta Iglesia Tijuana", presbyteryName: "20ma Tijuana", zoneName: "Zona 2" },
  { id: "39na-iglesia-tijuana", name: "39na Iglesia Tijuana", presbyteryName: "20ma Tijuana", zoneName: "Zona 2" },
  { id: "68va-iglesia-tijuana", name: "68va Iglesia Tijuana", presbyteryName: "20ma Tijuana", zoneName: "Zona 2" },
  { id: "80ma-iglesia-tijuana", name: "80ma Iglesia Tijuana", presbyteryName: "20ma Tijuana", zoneName: "Zona 2" },
  { id: "85ta-iglesia-tijuana", name: "85ta Iglesia Tijuana", presbyteryName: "20ma Tijuana", zoneName: "Zona 2" },
  { id: "21ra-iglesia-tijuana", name: "21ra Iglesia Tijuana", presbyteryName: "21ra Tijuana", zoneName: "Zona 1" },
  { id: "7ma-iglesia-rosarito", name: "7ma Iglesia Rosarito", presbyteryName: "21ra Tijuana", zoneName: "Zona 1" },
  { id: "8va-iglesia-rosarito", name: "8va Iglesia Rosarito", presbyteryName: "21ra Tijuana", zoneName: "Zona 1" },
  { id: "santa-anita", name: "Santa Anita", presbyteryName: "21ra Tijuana", zoneName: "Zona 1" },
  { id: "23ra-iglesia-tijuana", name: "23ra Iglesia Tijuana", presbyteryName: "23ra Tijuana", zoneName: "Zona 2" },
  { id: "33ra-iglesia-tijuana", name: "33ra Iglesia Tijuana", presbyteryName: "23ra Tijuana", zoneName: "Zona 2" },
  { id: "54ta-iglesia-tijuana", name: "54ta Iglesia Tijuana", presbyteryName: "23ra Tijuana", zoneName: "Zona 2" },
  { id: "74ta-iglesia-tijuana", name: "74ta Iglesia Tijuana", presbyteryName: "23ra Tijuana", zoneName: "Zona 2" },
  { id: "3ra-iglesia-rosarito", name: "3ra Iglesia Rosarito", presbyteryName: "25ta Tijuana", zoneName: "Zona 1" },
  { id: "5ta-iglesia-rosarito", name: "5ta Iglesia Rosarito", presbyteryName: "25ta Tijuana", zoneName: "Zona 1" },
  { id: "25ta-iglesia-tijuana", name: "25ta Iglesia Tijuana", presbyteryName: "25ta Tijuana", zoneName: "Zona 1" },
  { id: "61ra-iglesia-tijuana", name: "61ra Iglesia Tijuana", presbyteryName: "25ta Tijuana", zoneName: "Zona 1" },
  { id: "27ma-iglesia-tijuana", name: "27ma Iglesia Tijuana", presbyteryName: "27ma Tijuana", zoneName: "Zona 2" },
  { id: "44ta-iglesia-tijuana", name: "44ta Iglesia Tijuana", presbyteryName: "27ma Tijuana", zoneName: "Zona 2" },
  { id: "55ta-iglesia-tijuana", name: "55ta Iglesia Tijuana", presbyteryName: "27ma Tijuana", zoneName: "Zona 2" },
  { id: "59na-iglesia-tijuana", name: "59na Iglesia Tijuana", presbyteryName: "27ma Tijuana", zoneName: "Zona 2" },
  { id: "29na-iglesia-tijuana", name: "29na Iglesia Tijuana", presbyteryName: "29na Tijuana", zoneName: "Zona 2" },
  { id: "50ma-iglesia-tijuana", name: "50ma Iglesia Tijuana", presbyteryName: "29na Tijuana", zoneName: "Zona 2" },
  { id: "65ta-iglesia-tijuana", name: "65ta Iglesia Tijuana", presbyteryName: "29na Tijuana", zoneName: "Zona 2" },
  { id: "78va-iglesia-tijuana", name: "78va Iglesia Tijuana", presbyteryName: "29na Tijuana", zoneName: "Zona 2" },
  { id: "30ma-iglesia-tijuana", name: "30ma Iglesia Tijuana", presbyteryName: "30ma Tijuana", zoneName: "Zona 2" },
  { id: "52da-iglesia-tijuana", name: "52da Iglesia Tijuana", presbyteryName: "30ma Tijuana", zoneName: "Zona 2" },
  { id: "64ta-iglesia-tijuana", name: "64ta Iglesia Tijuana", presbyteryName: "30ma Tijuana", zoneName: "Zona 2" },
  { id: "70ma-iglesia-tijuana", name: "70ma Iglesia Tijuana", presbyteryName: "30ma Tijuana", zoneName: "Zona 2" },
  { id: "28ma-iglesia-tijuana", name: "28ma Iglesia Tijuana", presbyteryName: "37ma Tijuana", zoneName: "Zona 2" },
  { id: "37ma-iglesia-tijuana", name: "37ma Iglesia Tijuana", presbyteryName: "37ma Tijuana", zoneName: "Zona 2" },
  { id: "60ma-iglesia-tijuana", name: "60ma Iglesia Tijuana", presbyteryName: "37ma Tijuana", zoneName: "Zona 2" },
  { id: "24ta-iglesia-tijuana", name: "24ta Iglesia Tijuana", presbyteryName: "41ra Tijuana", zoneName: "Zona 2" },
  { id: "41ra-iglesia-tijuana", name: "41ra Iglesia Tijuana", presbyteryName: "41ra Tijuana", zoneName: "Zona 2" },
  { id: "42da-iglesia-tijuana", name: "42da Iglesia Tijuana", presbyteryName: "41ra Tijuana", zoneName: "Zona 2" },
  { id: "43ra-iglesia-tijuana", name: "43ra Iglesia Tijuana", presbyteryName: "41ra Tijuana", zoneName: "Zona 2" },
  { id: "48va-iglesia-tijuana", name: "48va Iglesia Tijuana", presbyteryName: "48va Tijuana", zoneName: "Zona 1" },
  { id: "51ra-iglesia-tijuana", name: "51ra Iglesia Tijuana", presbyteryName: "48va Tijuana", zoneName: "Zona 1" },
  { id: "66ta-iglesia-tijuana", name: "66ta Iglesia Tijuana", presbyteryName: "48va Tijuana", zoneName: "Zona 1" },
  { id: "69na-iglesia-tijuana", name: "69na Iglesia Tijuana", presbyteryName: "48va Tijuana", zoneName: "Zona 1" },
  { id: "38va-iglesia-tijuana", name: "38va Iglesia Tijuana", presbyteryName: "62da Tijuana", zoneName: "Zona 2" },
  { id: "45ta-iglesia-tijuana", name: "45ta Iglesia Tijuana", presbyteryName: "62da Tijuana", zoneName: "Zona 2" },
  { id: "49na-iglesia-tijuana", name: "49na Iglesia Tijuana", presbyteryName: "62da Tijuana", zoneName: "Zona 2" },
  { id: "62-iglesia-tijuana", name: "62 Iglesia Tijuana", presbyteryName: "62da Tijuana", zoneName: "Zona 2" },
  { id: "1ra-iglesia-rosarito", name: "1ra Iglesia Rosarito", presbyteryName: "1ra Rosarito", zoneName: "Zona 2" },
  { id: "2da-iglesia-rosarito", name: "2da Iglesia Rosarito", presbyteryName: "1ra Rosarito", zoneName: "Zona 1" },
  { id: "4ta-iglesia-rosarito", name: "4ta Iglesia Rosarito", presbyteryName: "1ra Rosarito", zoneName: "Zona 1" },
  { id: "6ta-iglesia-rosarito", name: "6ta Iglesia Rosarito", presbyteryName: "1ra Rosarito", zoneName: "Zona 1" },
  { id: "primotapia", name: "Primotapia", presbyteryName: "1ra Rosarito", zoneName: "Zona 1" },
  { id: "1ra-iglesia-tecate", name: "1ra Iglesia Tecate", presbyteryName: "1ra Tecate", zoneName: "Zona 2" },
  { id: "hongo", name: "Hongo", presbyteryName: "1ra Tecate", zoneName: "Zona 2" },
  { id: "jacume", name: "Jacume", presbyteryName: "1ra Tecate", zoneName: "Zona 2" },
  { id: "rumorosa", name: "Rumorosa", presbyteryName: "1ra Tecate", zoneName: "Zona 2" },
  { id: "2da-iglesia-tecate", name: "2da Iglesia Tecate", presbyteryName: "2da Tecate", zoneName: "Zona 2" },
  { id: "3ra-iglesia-tecate", name: "3ra Iglesia Tecate", presbyteryName: "2da Tecate", zoneName: "Zona 2" },
  { id: "valle-de-las-palmas", name: "Valle de Las Palmas", presbyteryName: "2da Tecate", zoneName: "Zona 2" },
  { id: "cerro-azul", name: "Cerro Azul", presbyteryName: "2da Tecate", zoneName: "Zona 2" },
  { id: "testerazo", name: "Testerazo", presbyteryName: "2da Tecate", zoneName: "Zona 2" },
];

/**
 * Excepciones a la derivación automática: iglesias cuyo NOMBRE no trae
 * ninguna palabra de ciudad y cuyo presbiterio tampoco ayuda -- "Santa
 * Anita" y "Penal El Hongo" están bajo presbiterios de Tijuana en la
 * jerarquía eclesiástica, pero geográficamente caen en Rosarito y Tecate.
 * Esto NO cambia su Presbiterio/Zona real -- solo el grupo en el que
 * aparecen dentro del buscador del registro.
 */
const CITY_OVERRIDES: Record<string, Exclude<City, 'Otra'>> = {
  'Santa Anita': 'Rosarito',
  'Penal El Hongo': 'Tecate',
};

/**
 * Prioridad: 1) excepción manual, 2) palabra de ciudad en el nombre de la
 * iglesia (más confiable: varias iglesias de Rosarito cuelgan de presbiterios
 * de Tijuana), 3) sufijo del presbiterio, 4) "Otra" en vez de fallar en silencio.
 */
export function deriveCity(churchName: string, presbyteryName: string): City {
  if (churchName in CITY_OVERRIDES) return CITY_OVERRIDES[churchName];

  const n = churchName.toLowerCase();
  if (n.includes('tijuana')) return 'Tijuana';
  if (n.includes('rosarito')) return 'Rosarito';
  if (n.includes('tecate')) return 'Tecate';

  if (presbyteryName.endsWith('Tijuana')) return 'Tijuana';
  if (presbyteryName.endsWith('Rosarito')) return 'Rosarito';
  if (presbyteryName.endsWith('Tecate')) return 'Tecate';

  return 'Otra';
}

export const churches: Church[] = RAW_CHURCHES.map((c) => ({
  ...c,
  city: deriveCity(c.name, c.presbyteryName),
}));

export const churchesById = new Map(churches.map((c) => [c.id, c]));

export const CITY_ORDER: City[] = ['Tijuana', 'Rosarito', 'Tecate', 'Otra'];

/** Orden "numérico real": "2da" antes que "10ma"; sin número, alfabético. */
export function naturalChurchCompare(a: string, b: string): number {
  const numA = parseInt(a.match(/^\d+/)?.[0] ?? '', 10);
  const numB = parseInt(b.match(/^\d+/)?.[0] ?? '', 10);
  if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) return numA - numB;
  if (!Number.isNaN(numA) !== !Number.isNaN(numB)) return Number.isNaN(numA) ? 1 : -1;
  return a.localeCompare(b, 'es');
}
