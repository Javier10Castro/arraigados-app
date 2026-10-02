import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_PAGE_SIZE, type PageSize } from '../../shared/api';

/**
 * Paginación EN EL NAVEGADOR para listas que ya llegaron completas y son
 * chicas por naturaleza (Usuarios, Lotes, feeds del Dashboard). Las tablas
 * que pueden crecer mucho (Asistentes, pulseras de un lote) se paginan en el
 * servidor y NO usan este hook.
 *
 * Orden: `items` ya debe venir filtrado y ordenado → aquí solo se corta la página.
 * - `resetKey`: cuando cambia (p. ej. el filtro activo), vuelve a la página 1.
 * - Si la lista se achica, la página se ajusta para no quedar en una vacía.
 * - `page` es 1-based, igual que <Pagination>.
 */
export function usePagedList<T>(items: readonly T[], resetKey: unknown = '', initialSize: PageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<PageSize>(initialSize);

  useEffect(() => setPage(1), [resetKey]);

  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pages);
  const pageItems = useMemo(() => items.slice((current - 1) * pageSize, current * pageSize), [items, current, pageSize]);

  return {
    page: current,
    pageSize,
    total: items.length,
    pageItems,
    /** Índice 0-based del primer elemento de la página (para numerar filas). */
    offset: (current - 1) * pageSize,
    setPage,
    setPageSize: (size: PageSize) => {
      setPageSizeState(size);
      setPage(1);
    },
  };
}
