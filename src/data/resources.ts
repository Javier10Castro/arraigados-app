/**
 * Recursos descargables de /recursos (5 oct 2026) -- lista ESTÁTICA.
 *
 * Decisión del propietario: sin panel de administración; los archivos se agregan
 * a mano. Hoy la lista está VACÍA a propósito (todavía no hay archivos reales; antes
 * la pantalla mostraba tarjetas de ejemplo cuyo botón no descargaba nada) y la
 * pantalla muestra "Pronto habrá recursos disponibles".
 *
 * CÓMO AGREGAR UN RECURSO (2 pasos, luego deploy):
 *   1. Copia el archivo a `public/recursos/` (p. ej. `public/recursos/fondo-arraigados.png`).
 *      Todo lo que esté en `public/` se publica tal cual en `/recursos/<archivo>`.
 *   2. Agrega una entrada aquí abajo:
 *        {
 *          id: 'fondo-arraigados',                 // único, sin espacios
 *          title: 'Fondo de pantalla Arraigados',  // lo que ve el asistente
 *          meta: 'PNG · 1080×1920',                // línea pequeña (formato, tamaño…)
 *          category: 'Fondos',                     // 'Fondos' | 'Stickers' | 'Presentaciones'
 *          file: '/recursos/fondo-arraigados.png', // ruta bajo public/
 *          thumb: '/recursos/fondo-arraigados-mini.jpg', // OPCIONAL: miniatura de fondo de la tarjeta
 *        },
 *   Los filtros ("Todos", "Fondos"…) se arman solos con las categorías que existan.
 *   Si el archivo es muy pesado (> ~5 MB), mejor comprimirlo antes.
 */

export type ResourceCategory = 'Fondos' | 'Stickers' | 'Presentaciones';

export type Resource = {
  id: string;
  title: string;
  meta: string;
  category: ResourceCategory;
  /** Ruta pública del archivo a descargar (bajo `public/`, empieza con `/recursos/`). */
  file: string;
  /** Miniatura opcional para la tarjeta (misma convención de ruta). */
  thumb?: string;
};

export const RESOURCES: Resource[] = [];
