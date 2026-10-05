import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Images, Package, ShoppingBag, X } from 'lucide-react';
import { api } from '../../lib/api';
import { formatPrice } from '../../data/app';
import { MERCH_AVAILABILITY_LABEL, type PublicMerchItem } from '../../../shared/api';
import Badge from '../../components/Badge';
import homeStyles from './Home.module.css';
import styles from './MerchCarousel.module.css';

/**
 * Vitrina "Mercancía oficial" de /home (3 oct 2026, conectada a datos reales
 * el 3 oct 2026): consume GET /api/merch (ver server/merch.ts), el mismo
 * tipo de catálogo administrable que ya tiene "Menú" -- con la diferencia de
 * que un artículo de Merch puede traer VARIAS fotos (galería con flechas en
 * el modal, ver MerchGallery más abajo).
 *
 * RECORDATORIO DE ALCANCE (crítico, confirmado explícitamente por Javier):
 * esta sección es INFORMATIVA. La mercancía NUNCA se vende dentro de la
 * app -- no hay carrito, no hay "Comprar ahora", no hay checkout. La compra
 * ocurre presencialmente durante el congreso. No agregar nada de eso sin que
 * Javier lo pida de forma explícita otra vez.
 *
 * Si no hay artículos todavía (nadie ha dado de alta ninguno en
 * /admin/merch, o la petición falla), la sección completa no se muestra --
 * mismo criterio que MenuCarousel.
 *
 * "Ver todo" (3 oct 2026; cambiado el 4 oct 2026): el carrusel horizontal es
 * bueno para un vistazo rápido, pero no escala bien conforme el catálogo
 * crece. Primero esto abría una hoja/modal con una cuadrícula igual a la
 * tarjeta del carrusel -- a Javier no le gustó ("no me gustó el modal"), así
 * que ahora el botón NAVEGA a una página completa (/home/mercancia, ver
 * MerchGallery.tsx) con un estilo de cuadrícula tipo mosaico/editorial,
 * deliberadamente distinto de la tarjeta de aquí. El modal de detalle
 * (MerchDetailModal, exportado abajo) sí se reutiliza tal cual en esa
 * página -- Javier pidió mantener el detalle como modal.
 */

export default function MerchCarousel() {
  const [items, setItems] = useState<PublicMerchItem[] | null>(null);
  const [selected, setSelected] = useState<PublicMerchItem | null>(null);
  const trackRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let alive = true;
    api
      .merch()
      .then((r) => {
        if (alive) setItems(r.items);
      })
      .catch(() => {
        if (alive) setItems([]); // sin conexión / error -- la sección simplemente no aparece
      });
    return () => {
      alive = false;
    };
  }, []);

  if (items === null) {
    return (
      <section className={`${homeStyles.section} ${homeStyles.current}`}>
        <h2 className="label">Mercancía oficial</h2>
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

  if (items.length === 0) return null;

  return (
    <section className={`${homeStyles.section} ${homeStyles.current}`}>
      <div className={styles.headingRow}>
        <h2 className="label">Mercancía oficial</h2>
        {items.length > 1 && (
          <Link to="/home/mercancia" className={styles.viewAllBtn}>
            <ShoppingBag size={14} strokeWidth={2.3} />
            <span>Ver todo</span>
            <span className={styles.viewAllCount}>{items.length}</span>
          </Link>
        )}
      </div>

      <ul className={styles.track} ref={trackRef}>
        {items.map((item) => (
          <li key={item.id} className={styles.slide}>
            <MerchCard item={item} onOpen={() => setSelected(item)} />
          </li>
        ))}
      </ul>

      <div className={styles.closing}>
        <p className={styles.tagline}>Lleva contigo un recuerdo de Arraigados 2K26.</p>
        <p className={styles.note}>Disponible presencialmente durante el congreso.</p>
      </div>

      {selected && <MerchDetailModal item={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tarjeta -- compacta (carrusel) y en cuadrícula (hoja "Ver todo")     */
/* comparten exactamente la misma estructura/clases.                   */
/* ------------------------------------------------------------------ */

function MerchCard({ item, onOpen }: { item: PublicMerchItem; onOpen: () => void }) {
  return (
    <button type="button" className={styles.card} onClick={onOpen} aria-label={`Ver detalle de ${item.name}`}>
      <span className={styles.visualZone}>
        <MerchVisual images={item.images} name={item.name} iconSize={26} />
        {item.images.length > 1 && (
          <span className={styles.imageCount} aria-hidden="true">
            <Images size={11} strokeWidth={2.4} /> {item.images.length}
          </span>
        )}
      </span>
      <span className={styles.panel}>
        <strong className={styles.name}>{item.name}</strong>
        <span className={styles.metaRow}>
          {item.price != null && <span className={styles.price}>{formatPrice(item.price)}</span>}
          <Badge variant="plain" className={styles.availabilityBadge}>
            {MERCH_AVAILABILITY_LABEL[item.availability]}
          </Badge>
        </span>
      </span>
    </button>
  );
}

export function MerchVisual({ images, name, iconSize }: { images: string[]; name: string; iconSize: number }) {
  const photo = images[0];
  if (photo) {
    return <img className={styles.photo} src={photo} alt={name} loading="lazy" />;
  }
  return (
    <span className={styles.photoPlaceholder} aria-hidden="true">
      <Package size={iconSize} strokeWidth={1.7} />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Modal de detalle -- galería con flechas cuando hay más de 1 foto.
 * Exportado: MerchGallery.tsx (página de "/home/mercancia") lo reutiliza
 * tal cual, en vez de tener su propia copia del modal.                */
/* ------------------------------------------------------------------ */

export function MerchDetailModal({ item, onClose }: { item: PublicMerchItem; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [photoIdx, setPhotoIdx] = useState(0);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hasPhotos = item.images.length > 0;
  const hasMultiple = item.images.length > 1;
  const goPrev = () => setPhotoIdx((i) => (i - 1 + item.images.length) % item.images.length);
  const goNext = () => setPhotoIdx((i) => (i + 1) % item.images.length);

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="merch-item-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.dialogClose} aria-label="Cerrar" onClick={onClose}>
          <X size={18} strokeWidth={2.4} />
        </button>

        <div className={styles.dialogVisualZone}>
          {hasPhotos ? (
            <img className={styles.photo} src={item.images[photoIdx]} alt={item.name} />
          ) : (
            <span className={styles.photoPlaceholder} aria-hidden="true">
              <Package size={44} strokeWidth={1.7} />
            </span>
          )}

          {hasMultiple && (
            <>
              <button type="button" className={`${styles.galleryArrow} ${styles.galleryArrowLeft}`} aria-label="Foto anterior" onClick={goPrev}>
                <ChevronLeft size={18} strokeWidth={2.6} />
              </button>
              <button type="button" className={`${styles.galleryArrow} ${styles.galleryArrowRight}`} aria-label="Foto siguiente" onClick={goNext}>
                <ChevronRight size={18} strokeWidth={2.6} />
              </button>
              <span className={styles.galleryDots} role="tablist" aria-label="Fotos del artículo">
                {item.images.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={i === photoIdx}
                    aria-label={`Foto ${i + 1} de ${item.images.length}`}
                    className={`${styles.galleryDot} ${i === photoIdx ? styles.galleryDotActive : ''}`}
                    onClick={() => setPhotoIdx(i)}
                  />
                ))}
              </span>
            </>
          )}
        </div>

        <div className={styles.dialogBody}>
          <h2 id="merch-item-title" className={styles.dialogName}>
            {item.name}
          </h2>
          <div className={styles.dialogMetaRow}>
            {item.price != null && <span className={styles.dialogPrice}>{formatPrice(item.price)}</span>}
            <Badge variant="plain">{MERCH_AVAILABILITY_LABEL[item.availability]}</Badge>
          </div>
          <p className={styles.dialogDesc}>{item.description}</p>
          <p className={styles.dialogNote}>Disponible presencialmente durante el congreso.</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
