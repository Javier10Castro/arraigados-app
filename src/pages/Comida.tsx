import { useCallback, useEffect, useState } from 'react';
import { Plus, UtensilsCrossed } from 'lucide-react';
import Button from '../components/Button';
import ScreenHeader from '../components/ScreenHeader';
import { Skeleton, SkeletonRegion } from '../components/Skeleton';
import { api } from '../lib/api';
import { VENUE_12VA, VENUE_21RA, formatPrice, foodDays, schedule } from '../data/app';
import type { PublicDish } from '../../shared/api';
import styles from './Comida.module.css';

/**
 * /comida -- menú REAL (7 oct 2026). Antes mostraba platillos de ejemplo de data/app.ts.
 *
 * Fuente única: GET /api/menu (api.menu(), la misma que usa el carrusel de /home), que sale de la
 * tabla de platillos que se administra en /admin/menu. Esa API solo devuelve los platillos
 * DISPONIBLES, así que un platillo agotado simplemente no aparece (no hay estado "agotado" que mostrar).
 * Cada platillo trae `venueName` ("12va IAFCJ" / "21ra IAFCJ", el catálogo fijo de sedes): se filtra por
 * ese campo, sin hardcodear qué platillo va en qué sede. La foto es `imageUrl` (o null: se muestra un ícono).
 */

/** Pestaña de sede (foodDays, sin cambios) -> nombre real de la sede. */
const VENUE_BY_TAB: Record<string, string> = { sede12: VENUE_12VA, sede21: VENUE_21RA };

/** Fechas del congreso, de la misma fuente que /programa y el Home (`schedule` en data/app.ts). */
const CONGRESS_DATES = schedule.map((d) => `${d.long} de 2026`);

export default function Comida() {
  const [tab, setTab] = useState(foodDays[0].id);
  const [dishes, setDishes] = useState<PublicDish[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    setFailed(false);
    setDishes(null);
    api
      .menu()
      .then((r) => alive && setDishes(r.dishes))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  const venue = VENUE_BY_TAB[tab];
  const items = dishes?.filter((d) => d.venueName === venue) ?? [];

  return (
    <div className={`page-enter ${styles.page}`}>
      <ScreenHeader title="Comida" back="/mas" />

      <div className={styles.segment} role="tablist" aria-label="Sede">
        {foodDays.map((d) => (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={d.id === tab}
            className={`${styles.segmentItem} ${d.id === tab ? styles.segmentActive : ''}`}
            onClick={() => setTab(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>

      <h2 className={styles.dayLabel}>
        <Plus size={14} strokeWidth={3} aria-hidden="true" />
        <span className={styles.dates}>
          {CONGRESS_DATES.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </span>
      </h2>

      {failed ? (
        <div className={styles.state} role="alert">
          <UtensilsCrossed size={22} aria-hidden="true" />
          <div>
            <strong>No pudimos cargar el menú</strong>
            <p>Revisa tu conexión e inténtalo de nuevo.</p>
            <Button size="sm" variant="outline" onClick={load}>
              Reintentar
            </Button>
          </div>
        </div>
      ) : dishes === null ? (
        <SkeletonRegion label="Cargando el menú…">
          <ul className={styles.list} aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className={styles.card}>
                <Skeleton w={78} h={78} r={9} className={styles.noShrink} />
                <span className={styles.body} style={{ flex: 1 }}>
                  <Skeleton w={i % 2 ? '60%' : '75%'} h={14} />
                  <Skeleton w="45%" h={11} style={{ marginTop: 8 }} />
                </span>
              </li>
            ))}
          </ul>
        </SkeletonRegion>
      ) : items.length === 0 ? (
        <div className={styles.state}>
          <UtensilsCrossed size={22} aria-hidden="true" />
          <div>
            <strong>Aún no hay platillos en esta sede</strong>
            <p>El menú se irá publicando aquí. Vuelve a revisar más tarde.</p>
          </div>
        </div>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id} className={styles.card}>
              {item.imageUrl ? (
                <img className={styles.thumb} src={item.imageUrl} alt={item.name} loading="lazy" />
              ) : (
                <span className={`${styles.thumb} ${styles.noPhoto}`} aria-hidden="true">
                  <UtensilsCrossed size={26} />
                </span>
              )}
              <div className={styles.body}>
                <h3 className={styles.name}>{item.name}</h3>
                {item.description && <p className={styles.desc}>{item.description}</p>}
                <p className={styles.price}>{formatPrice(item.price)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
