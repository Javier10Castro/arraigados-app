/**
 * Lógica compartida (frontend + funciones del servidor) para iglesias.
 * Copia fiel de src/lib/pulses.ts del proyecto Next.js (deriveCity /
 * CITY_OVERRIDES) -- si allá cambia, cambiar aquí también.
 *
 * Las iglesias en sí ya NO viven en el código: se leen de Neon
 * (tablas "Church" -> "Presbytery" -> "Zone") vía /api/churches.
 */

export type City = 'Tijuana' | 'Rosarito' | 'Tecate' | 'Otra';

export type Church = {
  id: string;
  name: string;
  presbyteryName: string;
  zoneName: string;
  city: City;
};

/**
 * Iglesias cuyo nombre no trae ciudad y cuyo presbiterio no refleja la
 * geografía real. Solo cambia el GRUPO en el buscador; su presbiterio y zona
 * reales (los de Neon) no se tocan.
 */
const CITY_OVERRIDES: Record<string, Exclude<City, 'Otra'>> = {
  'Santa Anita': 'Rosarito',
  'Penal El Hongo': 'Tecate',
};

/**
 * Prioridad: 1) excepción manual, 2) palabra de ciudad en el nombre de la
 * iglesia, 3) sufijo del presbiterio, 4) "Otra" en vez de fallar en silencio.
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

export const CITY_ORDER: City[] = ['Tijuana', 'Rosarito', 'Tecate', 'Otra'];

/** Orden "numérico real": "2da" antes que "10ma"; sin número, alfabético. */
export function naturalChurchCompare(a: string, b: string): number {
  const numA = parseInt(a.match(/^\d+/)?.[0] ?? '', 10);
  const numB = parseInt(b.match(/^\d+/)?.[0] ?? '', 10);
  if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) return numA - numB;
  if (!Number.isNaN(numA) !== !Number.isNaN(numB)) return Number.isNaN(numA) ? 1 : -1;
  return a.localeCompare(b, 'es');
}
