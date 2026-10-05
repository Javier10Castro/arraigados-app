import { useEffect, useState } from 'react';
import { Images, Package } from 'lucide-react';
import { api } from '../../lib/api';
import { formatPrice } from '../../data/app';
import { MERCH_AVAILABILITY_LABEL, type PublicMerchItem } from '../../../shared/api';
import Badge from '../../components/Badge';
import ScreenHeader from '../../components/ScreenHeader';
import { MerchDetailModal } from './MerchCarousel';
import styles from './MerchGallery.module.css';

/**
 * /home/mercancia (4 oct 2026) -- "Ver todo" de la vitrina de Mercancía ya
 * NO abre un modal/hoja (a Javier no le gustó: "no me gustó el modal" /
 * "inventa alguna opción diferente"). Ahora es una página completa propia,
 * con un estilo de cuadrícula tipo mosaico/editorial (tamaños de tarjeta
 * alternados, foto a sangre completa con degradado inferior) -- deliberada-
 * mente distinto tanto de la tarjeta del carrusel como de la cuadrícula
 * pareja que tenía antes la hoja. El detalle de cada artículo SIGUE
 * mostrándose en un modal (MerchDetailModal, importado de MerchCarousel.tsx
 * tal cual -- Javier pidió mantener eso).
 *
 * Reutiliza el mismo GET /api/merch -- no depende de llegar aquí desde
 * /home (funciona también si se recarga la página directamente).
 */

/** Patrón de tamaños del mosaico: índices divisibles por 5 son el tile
 *  "destacado" (grande); 1 de cada 3 restantes es "alto". El resto es
 *  normal. Puramente visual -- no depende de los datos del artículo. */
function tileVariant(index: number): 'big' | 'tall' | 'normal' {
  if (index % 5 === 0) return 'big';
  if (index % 3 === 2) return 'tall';
  return 'normal';
}

export default function MerchGallery() {
  const [items, setItems] = useState<PublicMerchItem[] | null>(null);
  const [selected, setSelected] = useState<PublicMerchItem | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .merch()
      .then((r) => {
        if (alive) setItems(r.items);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className={`page-enter ${styles.page}`}>
      <ScreenHeader title="Mercancía oficial" back="/home" />

      <p className={styles.intro}>Todo lo disponible para llevar de Arraigados 2K26.</p>

      {items === null && (
        <ul className={styles.mosaic} aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i} className={`${styles.tile} ${styles[tileVariant(i)]}`}>
              <div className={styles.skeleton} />
            </li>
          ))}
        </ul>
      )}

      {items !== null && items.length === 0 && <p className={styles.empty}>Todavía no hay mercancía dada de alta.</p>}

      {items !== null && items.length > 0 && (
        <ul className={styles.mosaic}>
          {items.map((item, i) => (
            <li key={item.id} className={`${styles.tile} ${styles[tileVariant(i)]}`}>
              <MerchTile item={item} onOpen={() => setSelected(item)} />
            </li>
          ))}
        </ul>
      )}

      {selected && <MerchDetailModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function MerchTile({ item, onOpen }: { item: PublicMerchItem; onOpen: () => void }) {
  const photo = item.images[0];
  return (
    <button type="button" className={styles.poster} onClick={onOpen} aria-label={`Ver detalle de ${item.name}`}>
      {photo ? (
        <img className={styles.photo} src={photo} alt={item.name} loading="lazy" />
      ) : (
        <span className={styles.photoPlaceholder} aria-hidden="true">
          <Package size={30} strokeWidth={1.6} />
        </span>
      )}

      <span className={styles.topRow}>
        <Badge variant="tag" className={styles.availability}>
          {MERCH_AVAILABILITY_LABEL[item.availability]}
        </Badge>
        {item.images.length > 1 && (
          <span className={styles.imageCount} aria-hidden="true">
            <Images size={11} strokeWidth={2.4} /> {item.images.length}
          </span>
        )}
      </span>

      <span className={styles.scrim} aria-hidden="true" />
      <span className={styles.caption}>
        <strong className={styles.captionName}>{item.name}</strong>
        {item.price != null && <span className={styles.captionPrice}>{formatPrice(item.price)}</span>}
      </span>
    </button>
  );
}
