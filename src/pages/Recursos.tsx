import { useMemo, useState } from 'react';
import { Download, FolderOpen } from 'lucide-react';
import ScreenHeader from '../components/ScreenHeader';
import { RESOURCES } from '../data/resources';
import styles from './Recursos.module.css';

/**
 * /recursos -- descargas reales de data/resources.ts (lista estática; ver ese archivo
 * para agregar archivos). Mientras no haya ninguno, muestra un aviso en vez de tarjetas
 * de ejemplo. Los filtros salen de las categorías que existan.
 */
export default function Recursos() {
  const [filter, setFilter] = useState('Todos');
  const filters = useMemo(() => ['Todos', ...Array.from(new Set(RESOURCES.map((r) => r.category)))], []);
  const visible = RESOURCES.filter((r) => filter === 'Todos' || r.category === filter);

  return (
    <div className={`page-enter ${styles.page}`}>
      <ScreenHeader title="Recursos" back="/mas" />

      <div className={styles.panel}>
        {RESOURCES.length === 0 ? (
          <div className={styles.empty}>
            <FolderOpen size={26} strokeWidth={1.8} aria-hidden="true" />
            <strong>Pronto habrá recursos disponibles</strong>
            <span>Fondos de pantalla, stickers y presentaciones del congreso aparecerán aquí.</span>
          </div>
        ) : (
          <>
            {filters.length > 2 && (
              <div className={styles.filters}>
                <div className={styles.chips} role="tablist" aria-label="Filtros">
                  {filters.map((f) => (
                    <button
                      key={f}
                      type="button"
                      role="tab"
                      aria-selected={f === filter}
                      className={`${styles.chip} ${f === filter ? styles.chipActive : ''}`}
                      onClick={() => setFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <ul className={styles.list}>
              {visible.map((r) => (
                <li key={r.id} className={styles.card}>
                  {r.thumb && <img className={styles.thumb} src={r.thumb} alt="" loading="lazy" />}
                  <div className={styles.body}>
                    <h3 className={styles.title}>{r.title}</h3>
                    <p className={styles.meta}>{r.meta}</p>
                  </div>
                  <a className={styles.download} href={r.file} download aria-label={`Descargar ${r.title}`}>
                    <Download size={17} strokeWidth={2.2} />
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
