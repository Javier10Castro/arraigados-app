import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZES, type PageSize } from '../../shared/api';
import styles from './Pagination.module.css';

/**
 * Paginación ÚNICA de la app (regla global de tablas, handoff §37).
 *
 *   Mostrando 11–20 de 127        Por página [10 ▾]
 *   [← Anterior] [1] [2] [3] … [13] [Siguiente →]
 *
 * - `page` es 1-based (lo que ve la persona). `total` es el total YA filtrado.
 * - Sirve igual para paginación en el servidor (Asistentes, pulseras de un
 *   lote) y en el navegador (`usePagedList`).
 * - Si `onPageSizeChange` se pasa, muestra el selector 10 / 25 / 50.
 * - Con 0 resultados no se dibuja (la pantalla muestra su estado vacío).
 */
type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: PageSize) => void;
  /** Nombre de lo que se cuenta, para lectores de pantalla ("pulseras"). */
  label?: string;
  disabled?: boolean;
};

export default function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, label = 'resultados', disabled = false }: Props) {
  if (total <= 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const go = (p: number) => !disabled && p >= 1 && p <= pages && p !== current && onPageChange(p);

  return (
    <nav className={styles.pager} aria-label={`Paginación de ${label}`}>
      <p className={styles.range} aria-live="polite">
        Mostrando <b>{from}–{to}</b> de <b>{total.toLocaleString('es-MX')}</b>
      </p>

      {onPageSizeChange && (
        <label className={styles.size}>
          <span>Por página</span>
          <select value={pageSize} disabled={disabled} onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}>
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}

      {pages > 1 && (
        <div className={styles.pages}>
          <button type="button" className={styles.step} disabled={disabled || current === 1} onClick={() => go(current - 1)} aria-label="Página anterior">
            <ChevronLeft size={16} aria-hidden="true" />
            <span className={styles.stepText}>Anterior</span>
          </button>
          {pageList(current, pages).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} className={styles.gap} aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className={`${styles.num} ${p === current ? styles.on : ''}`}
                aria-current={p === current ? 'page' : undefined}
                aria-label={`Página ${p}`}
                disabled={disabled}
                onClick={() => go(p)}
              >
                {p}
              </button>
            ),
          )}
          <button type="button" className={styles.step} disabled={disabled || current === pages} onClick={() => go(current + 1)} aria-label="Página siguiente">
            <span className={styles.stepText}>Siguiente</span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  );
}

/** 1 … 4 5 6 … 13: primera, última, la actual y una a cada lado; `null` = hueco. */
export function pageList(current: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((n) => set.add(n));
  if (current >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((n) => set.add(n));
  const list = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  list.forEach((n, i) => {
    if (i > 0 && n - list[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}
