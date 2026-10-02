import { useState } from 'react';
import { Check, Download } from 'lucide-react';
import ScreenHeader from '../components/ScreenHeader';
import { resourceFilters, resources } from '../data/app';
import styles from './Recursos.module.css';

export default function Recursos() {
  const [filter, setFilter] = useState('Todos');
  const [downloaded, setDownloaded] = useState<string[]>([]);

  const visible = resources.filter((r) => filter === 'Todos' || r.tag === filter);

  return (
    <div className={`page-enter ${styles.page}`}>
      <ScreenHeader title="Recursos" back="/mas" />

      <div className={styles.panel}>
        <div className={styles.filters}>
          <div className={styles.chips} role="tablist" aria-label="Filtros">
            {resourceFilters.map((f) => (
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

        <ul className={styles.list}>
          {visible.map((r) => (
            <li key={r.id} className={styles.card}>
              <img className={styles.thumb} src={r.img} alt="" loading="lazy" />
              <div className={styles.body}>
                <h3 className={styles.title}>{r.title}</h3>
                <p className={styles.meta}>{r.meta}</p>
              </div>
              <button
                type="button"
                className={`${styles.download} ${downloaded.includes(r.id) ? styles.done : ''}`}
                aria-label={`Descargar ${r.title}`}
                onClick={() => setDownloaded((d) => (d.includes(r.id) ? d.filter((x) => x !== r.id) : [...d, r.id]))}
              >
                {downloaded.includes(r.id) ? <Check size={17} strokeWidth={2.6} /> : <Download size={17} strokeWidth={2.2} />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
