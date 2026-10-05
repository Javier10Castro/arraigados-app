import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import UserAvatar from '../UserAvatar';
import type { Note, NoteFeedItem } from '../../../shared/api';
import type { NotesStatus } from './useMyNotes';
import type { FeedStatus } from './useNotesFeed';
import NoteBubble from './NoteBubble';
import styles from './NoteTray.module.css';

/**
 * Carrusel de Notas de /home (5 oct 2026), al estilo de las Notas de Instagram:
 * una fila horizontal de avatares, cada uno con su nota en una burbuja encima.
 * El primero eres tú (tu nota, o la invitación a escribirla; toca para abrir el
 * panel); después, las notas vigentes de los demás asistentes, la más reciente primero.
 * Cada burbuja aparece con un pequeño retraso escalonado ("irlos poniendo").
 *
 * Solo dibuja: los datos llegan resueltos de useMyNotes / useNotesFeed.
 */
type Props = {
  me: { attendeeId: string; name: string };
  ownStatus: NotesStatus;
  ownNote: Note | null;
  onOpenOwn: () => void;
  feedStatus: FeedStatus;
  feed: NoteFeedItem[];
};

const AVATAR = 78;

export default function NoteTray({ me, ownStatus, ownNote, onOpenOwn, feedStatus, feed }: Props) {
  const rail = useRef<HTMLUListElement>(null);
  // Flechas: cada una solo aparece si hay algo hacia ese lado (izquierda oculta al inicio,
  // derecha oculta al final), así también se entiende cuándo ya no hay más que mostrar.
  const [edge, setEdge] = useState({ prev: false, next: false });
  const measure = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    const prev = el.scrollLeft > 2;
    const next = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdge((e) => (e.prev === prev && e.next === next ? e : { prev, next }));
  }, []);
  useEffect(() => {
    measure();
    const el = rail.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, feed.length, feedStatus]);

  const scrollBy = (dir: 1 | -1) => rail.current?.scrollBy({ left: dir * rail.current.clientWidth * 0.8, behavior: 'smooth' });

  const ownBubble =
    ownStatus === 'loading' ? (
      <NoteBubble variant="loading" />
    ) : ownStatus === 'error' ? (
      <NoteBubble variant="muted" text="Tu nota no cargó" onClick={onOpenOwn} label="No pudimos cargar tu nota. Toca para reintentar" />
    ) : ownNote ? (
      <NoteBubble variant="filled" text={ownNote.text} onClick={onOpenOwn} label={`Tu nota: ${ownNote.text}. Toca para cambiarla`} />
    ) : (
      <NoteBubble variant="invite" text="¿Qué tienes en mente?" onClick={onOpenOwn} label="Escribir una nota" />
    );

  return (
    <section className={`${styles.tray} ${edge.prev ? styles.canPrev : ''} ${edge.next ? styles.canNext : ''}`} aria-label="Notas">
      <button type="button" className={`${styles.nav} ${styles.prev}`} aria-label="Ver notas anteriores" tabIndex={edge.prev ? 0 : -1} aria-hidden={!edge.prev} onClick={() => scrollBy(-1)}>
        <ChevronLeft size={18} strokeWidth={2.6} />
      </button>

      <ul className={styles.rail} ref={rail} onScroll={measure} tabIndex={0} aria-label="Notas de la comunidad">
        <li className={styles.item} style={{ ['--i' as string]: 0 }}>
          <div className={styles.bubbleSlot} key={ownNote?.id ?? ownStatus}>{ownBubble}</div>
          <button type="button" className={styles.avatarBtn} onClick={onOpenOwn} tabIndex={-1} aria-hidden="true">
            <UserAvatar size={AVATAR} attendeeId={me.attendeeId} name={me.name} />
          </button>
          <span className={`${styles.name} ${styles.own}`}>Tu nota</span>
        </li>

        {feedStatus === 'loading' &&
          [1, 2, 3].map((i) => (
            <li className={styles.item} key={`s${i}`} style={{ ['--i' as string]: i }} aria-hidden="true">
              <div className={styles.bubbleSlot}><NoteBubble variant="loading" /></div>
              <span className={styles.ghostAvatar} />
              <span className={styles.ghostName} />
            </li>
          ))}

        {feed.map((n, i) => (
          <li className={styles.item} key={n.id} style={{ ['--i' as string]: Math.min(i + 1, 12) }}>
            <div className={styles.bubbleSlot}><NoteBubble variant="filled" text={n.text} /></div>
            <UserAvatar size={AVATAR} attendeeId={n.attendeeId} name={n.firstName} />
            <span className={styles.name}>{n.firstName}</span>
          </li>
        ))}

        {feedStatus === 'error' && <li className={styles.hint}>No pudimos cargar las notas de los demás.</li>}
        {feedStatus === 'ready' && feed.length === 0 && <li className={styles.hint}>Aún no hay notas de otros. ¡Sé el primero!</li>}
      </ul>

      <button type="button" className={`${styles.nav} ${styles.next}`} aria-label="Ver más notas" tabIndex={edge.next ? 0 : -1} aria-hidden={!edge.next} onClick={() => scrollBy(1)}>
        <ChevronRight size={18} strokeWidth={2.6} />
      </button>
    </section>
  );
}
