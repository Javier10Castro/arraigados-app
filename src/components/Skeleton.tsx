import type { CSSProperties, ReactNode } from 'react';
import styles from './Skeleton.module.css';

/**
 * Sistema de "esqueletos" de carga (handoff §38). Regla de la app:
 *
 *   cargando → esqueleto     terminó con 0 → estado vacío
 *   error    → mensaje        terminó con datos → datos
 *
 * Nunca se usa `!data` para decidir "vacío": mientras carga no se muestran
 * "0", "Sin resultados" ni tablas vacías.
 *
 * Piezas (todas comparten el mismo brillo sutil; con prefers-reduced-motion
 * quedan fijas):
 * - <Skeleton>          bloque suelto (ancho/alto/radio).
 * - <SkeletonRows>      filas <tr> para el <tbody> de una tabla real (el
 *                       encabezado se queda; mismo alto de fila ⇒ sin saltos).
 * - <ListSkeleton>      filas con círculo + 2 líneas (listas, actividad).
 * - <CardSkeleton>      tarjeta tipo KPI: etiqueta, número grande, detalle.
 * - <ChartSkeleton>     columnas de alturas fijas con el alto de la gráfica.
 * - <SkeletonRegion>    contenedor accesible (aria-busy + "Cargando…" oculto).
 */

type Size = number | string;
const px = (v?: Size) => (typeof v === 'number' ? `${v}px` : v);

export function Skeleton({ w = '100%', h = 12, r = 6, className, style }: { w?: Size; h?: Size; r?: Size; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={`${styles.sk}${className ? ` ${className}` : ''}`}
      style={{ width: px(w), height: px(h), borderRadius: px(r), ...style }}
      aria-hidden="true"
    />
  );
}

/** Contenedor accesible de cualquier esqueleto. */
export function SkeletonRegion({ label = 'Cargando…', className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div className={className} aria-busy="true" role="status">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Anchos "naturales" que se repiten para que las filas no se vean idénticas. */
const WIDTHS = ['72%', '55%', '84%', '63%', '48%', '76%', '58%'];

/**
 * Filas de tabla. `cols` = número de columnas o anchos por columna.
 * `classNames`: la clase de cada <td> real (p. ej. las columnas que se ocultan
 * en celular), para que el esqueleto tenga exactamente las mismas columnas.
 */
export function SkeletonRows({
  cols,
  rows = 10,
  rowHeight = 46,
  classNames = [],
}: {
  cols: number | Size[];
  rows?: number;
  rowHeight?: number;
  classNames?: (string | undefined)[];
}) {
  const widths = typeof cols === 'number' ? Array.from({ length: cols }, (_, i) => WIDTHS[i % WIDTHS.length]) : cols;
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className={styles.row} style={{ height: rowHeight }} aria-hidden="true">
          {widths.map((w, c) => (
            <td key={c} className={classNames[c]}>
              <Skeleton w={typeof w === 'string' && w.endsWith('%') ? WIDTHS[(r + c) % WIDTHS.length] : w} h={11} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Lista con avatar + dos líneas (feeds, listas de cuentas, lotes). */
export function ListSkeleton({ rows = 5, avatar = true, rowClassName, label }: { rows?: number; avatar?: boolean; rowClassName?: string; label?: string }) {
  const list = (
    <ul className={styles.list} aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className={rowClassName ?? styles.listRow}>
            {avatar && <Skeleton w={32} h={32} r="50%" className={styles.noShrink} />}
            <span className={styles.lines}>
              <Skeleton w={WIDTHS[i % WIDTHS.length]} h={12} />
              <Skeleton w={WIDTHS[(i + 3) % WIDTHS.length]} h={10} />
            </span>
          </li>
        ))}
    </ul>
  );
  // Con `label` es una región de carga accesible por sí misma; sin él va dentro de otra (p. ej. el Dashboard).
  return label ? <SkeletonRegion label={label}>{list}</SkeletonRegion> : list;
}

/** Tarjeta tipo KPI. La clase de la tarjeta real se pasa en `className` para conservar su tamaño. */
export function CardSkeleton({ className, lines = 2 }: { className?: string; lines?: number }) {
  return (
    <div className={className} aria-hidden="true">
      <Skeleton w="45%" h={11} />
      <Skeleton w="38%" h={40} r={8} className={styles.value} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} w={WIDTHS[(i + 1) % WIDTHS.length]} h={10} />
      ))}
    </div>
  );
}

/** Gráfica de columnas: conserva el alto real (incluye el eje de 20px). */
const BAR_HEIGHTS = [35, 55, 42, 70, 50, 82, 64, 46, 74, 58, 38, 66];
export function ChartSkeleton({ height = 150, bars = 12 }: { height?: number; bars?: number }) {
  return (
    <div className={styles.chart} style={{ height: height + 20 }} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <Skeleton key={i} w="100%" h={`${BAR_HEIGHTS[i % BAR_HEIGHTS.length]}%`} r="4px 4px 0 0" className={styles.bar} />
      ))}
    </div>
  );
}
