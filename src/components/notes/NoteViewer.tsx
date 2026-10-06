import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Heart, X } from 'lucide-react';
import UserAvatar from '../UserAvatar';
import LikeBadge from './LikeBadge';
import type { NoteFeedItem } from '../../../shared/api';
import { remaining } from './NoteSheet';
import sheet from './NoteSheet.module.css';
import styles from './NoteViewer.module.css';

/**
 * Nota de otra persona, a pantalla completa de hoja (5 oct 2026): el texto completo,
 * quién la escribió y el botón de corazón. También se puede dar like con doble toque
 * sobre el texto, como en Instagram. Reutiliza la hoja de NoteSheet (misma forma y
 * comportamiento: Escape, clic fuera y fondo bloqueado).
 */
type Props = {
  item: NoteFeedItem;
  onClose: () => void;
  onLike: (id: string, mode: 'like' | 'toggle') => void;
};

export default function NoteViewer({ item, onClose, onLike }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pop, setPop] = useState(0);

  // Mismo patrón que NoteSheet: `onClose` en un ref y efectos de una sola corrida.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  const doubleTap = () => {
    setPop((n) => n + 1);
    onLike(item.id, 'like');
  };

  return createPortal(
    <div className={sheet.backdrop} onClick={onClose}>
      <div
        ref={dialogRef}
        className={sheet.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-viewer-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={sheet.grip} aria-hidden="true" />
        <button type="button" className={sheet.close} aria-label="Cerrar" onClick={onClose}>
          <X size={18} strokeWidth={2.4} />
        </button>

        <div className={sheet.body}>
          <div className={styles.who}>
            <UserAvatar size={64} attendeeId={item.attendeeId} name={item.firstName} />
            <h2 id="note-viewer-title" className={styles.name}>{item.firstName}</h2>
          </div>

          <div className={styles.noteWrap} onDoubleClick={doubleTap}>
            <p className={`${sheet.preview} ${styles.text}`}>{item.text}</p>
            {pop > 0 && <Heart key={pop} className={styles.pop} size={84} fill="currentColor" strokeWidth={0} aria-hidden="true" />}
          </div>

          <div className={styles.row}>
            <button
              type="button"
              className={`${styles.heart} ${item.likedByMe ? styles.liked : ''}`}
              aria-pressed={item.likedByMe}
              aria-label={item.likedByMe ? 'Quitar me gusta' : 'Me gusta'}
              onClick={() => onLike(item.id, 'toggle')}
            >
              <LikeBadge on={item.likedByMe} size={30} count={item.likeCount} label="Me gusta" />
            </button>
            <span className={sheet.meta}>Se desvanece en {remaining(item.expiresAt, Date.now())}</span>
          </div>
          <p className={styles.hint}>También puedes dar doble toque sobre la nota.</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
