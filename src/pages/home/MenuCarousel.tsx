import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, UtensilsCrossed, X } from 'lucide-react';
import { api } from '../../lib/api';
import { formatPrice } from '../../data/app';
import type { PublicDish } from '../../../shared/api';
import homeStyles from './Home.module.css';
import styles from './MenuCarousel.module.css';

/**
 * Carrusel "Menú" de /home (3 oct 2026) -- consume el menú administrable
 * REAL (GET /api/menu, ver server/dishes.ts listMenuPublic) y reutiliza el
 * lenguaje visual ya aprobado en /menu-preview (pages/menu-preview/): foto
 * protagonista + panel glassmorphism sutil, tarjeta completa clickeable, y
 * un modal de detalle con foto grande, nombre, precio, descripción y sede.
 *
 * Diferencias a propósito frente a /menu-preview (que usaba datos mock):
 *  - Es un carrusel de scroll horizontal (con snap), no una cuadrícula --
 *    así lo pidió Javier para esta sección de Home, independiente del resto
 *    de la pantalla.
 *  - Sin indicador de "Disponible/No disponible": /api/menu ya filtra solo
 *    los platillos disponibles (ver listMenuPublic), así que aquí ese dato
 *    siempre sería "Disponible" -- mostrarlo sería ruido.
 *  - La foto es opcional (el admin pudo no haber subido/encontrado una
 *    todavía): sin imageUrl se muestra un ícono de platillo en su lugar, en
 *    vez de un <img> roto.
 *
 * Si no hay platillos (nadie ha dado de alta ninguno en /admin/menu todavía,
 * o la petición falla), la sección completa no se muestra -- nada de un
 * encabezado "Menú" seguido de un carrusel vacío.
 *
 * Auto-avance (3 oct 2026, pedido de Javier: "que se vaya moviendo si hay
 * más de los que caben en el div"): cada tanto avanza una tarjeta sola,
 * dando la vuelta al llegar al final -- pero SOLO si de verdad hay más
 * platillos de los que caben a la vez (scrollWidth > clientWidth); con
 * pocos platillos que ya caben todos, no se mueve nada. Se detiene en
 * cuanto la persona toca/hace scroll/pasa el mouse (sigue siendo 100%
 * controlable a mano) y se reanuda sola tras un rato sin interacción.
 * Respeta prefers-reduced-motion (no se mueve solo, pero el scroll manual
 * sigue funcionando igual).
 */
const AUTO_ADVANCE_MS = 3200;
const RESUME_AFTER_IDLE_MS = 4500;

export default function MenuCarousel() {
  const [dishes, setDishes] = useState<PublicDish[] | null>(null);
  const [selected, setSelected] = useState<PublicDish | null>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const pausedRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .menu()
      .then((r) => {
        if (alive) setDishes(r.dishes);
      })
      .catch(() => {
        if (alive) setDishes([]); // sin conexión / error -- la sección simplemente no aparece
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!dishes || dishes.length === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const pauseAndScheduleResume = () => {
      pausedRef.current = true;
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = setTimeout(() => {
        pausedRef.current = false;
      }, RESUME_AFTER_IDLE_MS);
    };
    const pauseNow = () => {
      pausedRef.current = true;
    };
    const resumeNow = () => {
      pausedRef.current = false;
    };

    const el = trackRef.current;
    if (!el) return;
    // Pausa mientras la persona interactúa (touch/scroll a mano/mouse encima),
    // y se reanuda sola después de un rato quieta -- nunca "pelea" el scroll.
    el.addEventListener('pointerdown', pauseAndScheduleResume);
    el.addEventListener('touchstart', pauseAndScheduleResume, { passive: true });
    el.addEventListener('wheel', pauseAndScheduleResume, { passive: true });
    el.addEventListener('mouseenter', pauseNow);
    el.addEventListener('mouseleave', resumeNow);

    const id = window.setInterval(() => {
      const track = trackRef.current;
      if (!track || pausedRef.current) return;
      // Nada que mover: todas las tarjetas ya caben a la vez en el div.
      if (track.scrollWidth <= track.clientWidth + 2) return;

      const firstSlide = track.querySelector<HTMLElement>(`.${styles.slide}`);
      const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || '14') || 14;
      const step = firstSlide ? firstSlide.getBoundingClientRect().width + gap : track.clientWidth * 0.8;

      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
      track.scrollTo({ left: atEnd ? 0 : track.scrollLeft + step, behavior: 'smooth' });
    }, AUTO_ADVANCE_MS);

    return () => {
      window.clearInterval(id);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      el.removeEventListener('pointerdown', pauseAndScheduleResume);
      el.removeEventListener('touchstart', pauseAndScheduleResume);
      el.removeEventListener('wheel', pauseAndScheduleResume);
      el.removeEventListener('mouseenter', pauseNow);
      el.removeEventListener('mouseleave', resumeNow);
    };
  }, [dishes]);

  if (dishes === null) {
    return (
      <section className={`${homeStyles.section} ${homeStyles.current}`}>
        <h2 className="label">Menú</h2>
        <ul className={styles.track} aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className={styles.slide}>
              <div className={styles.skeletonCard} />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (dishes.length === 0) return null;

  return (
    <section className={`${homeStyles.section} ${homeStyles.current}`}>
      <h2 className="label">Menú</h2>
      <ul className={styles.track} ref={trackRef}>
        {dishes.map((d) => (
          <li key={d.id} className={styles.slide}>
            <button type="button" className={styles.card} onClick={() => setSelected(d)} aria-label={`Ver detalle de ${d.name}`}>
              <div className={styles.photoZone}>
                {d.imageUrl ? (
                  <img className={styles.dishPhoto} src={d.imageUrl} alt={d.name} loading="lazy" />
                ) : (
                  <span className={styles.photoPlaceholder} aria-hidden="true">
                    <UtensilsCrossed size={24} strokeWidth={1.8} />
                  </span>
                )}
              </div>
              <div className={styles.glassPanel}>
                <h3 className={styles.dishName}>{d.name}</h3>
                <span className={styles.price}>{formatPrice(d.price)}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {selected && <DishDetailModal dish={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

/** Misma mecánica que el modal de /menu-preview (DishModal.tsx): portal a
 * document.body, cierra con Escape/clic fuera/botón, foco entra al abrir. */
function DishDetailModal({ dish, onClose }: { dish: PublicDish; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-dish-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.dialogClose} aria-label="Cerrar" onClick={onClose}>
          <X size={18} strokeWidth={2.4} />
        </button>

        <div className={styles.dialogPhotoZone}>
          {dish.imageUrl ? (
            <img className={styles.dialogPhoto} src={dish.imageUrl} alt={dish.name} />
          ) : (
            <span className={styles.dialogPlaceholder} aria-hidden="true">
              <UtensilsCrossed size={40} strokeWidth={1.6} />
            </span>
          )}
        </div>

        <div className={styles.dialogBody}>
          <h2 id="menu-dish-title" className={styles.dialogName}>
            {dish.name}
          </h2>
          <span className={styles.dialogPrice}>{formatPrice(dish.price)}</span>
          <p className={styles.dialogDesc}>{dish.description}</p>
          <p className={styles.dialogVenue}>
            <MapPin size={14} strokeWidth={2.2} aria-hidden="true" />
            Sede: {dish.venueName}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
