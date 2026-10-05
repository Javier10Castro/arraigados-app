import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import UserAvatar from '../UserAvatar';
import type { Note, NoteFeedItem } from '../../../shared/api';
import type { NotesStatus } from './useMyNotes';
import type { FeedStatus } from './useNotesFeed';
import NoteBubble from './NoteBubble';
import NoteViewer from './NoteViewer';
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
  /** 'like' = doble toque (solo da like) · 'toggle' = botón del visor. */
  onLike: (id: string, mode: 'like' | 'toggle') => void;
};

/**
 * Nota de otra persona en el carrusel. Un toque abre la nota completa (con su botón de
 * corazón); doble toque da like directo, como en Instagram. Para distinguirlos, el toque
 * simple espera un instante (DOUBLE_TAP_MS) por si llega el segundo.
 */
const DOUBLE_TAP_MS = 260;

function FeedItem({ n, index, onOpen, onLike }: { n: NoteFeedItem; index: number; onOpen: () => void; onLike: Props['onLike'] }) {
  const timer = useRef<number | undefined>(undefined);
  const [pop, setPop] = useState(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const tap = () => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
      setPop((k) => k + 1);
      onLike(n.id, 'like');
    } else {
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        onOpen();
      }, DOUBLE_TAP_MS);
    }
  };

  return (
    <li className={styles.item} style={{ ['--i' as string]: Math.min(index + 1, 12) }}>
      <button type="button" className={styles.hit} onClick={tap} aria-label={`Nota de ${n.firstName}: ${n.text}. Toca para verla completa; doble toque para dar me gusta`}>
        <span className={styles.bubbleSlot}><NoteBubble variant="filled" text={n.text} /></span>
        <span className={styles.avatarBox}>
          <UserAvatar size={AVATAR} attendeeId={n.attendeeId} name={n.firstName} />
          {n.likedByMe && <Heart className={styles.likedBadge} size={20} fill="currentColor" strokeWidth={0} aria-label="Te gustó" />}
          {pop > 0 && <Heart key={pop} className={styles.pop} size={52} fill="currentColor" strokeWidth={0} aria-hidden="true" />}
        </span>
        <span className={styles.name}>{n.firstName}</span>
      </button>
    </li>
  );
}

const AVATAR = 78;

export default function NoteTray({ me, ownStatus, ownNote, onOpenOwn, feedStatus, feed, onLike }: Props) {
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = feed.find((n) => n.id === viewingId) ?? null;
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
          <span className={`${styles.name} ${styles.own}`}>
            Tu nota
            {ownNote && ownNote.likeCount > 0 && (
              <span className={styles.ownLikes}><Heart size={12} fill="currentColor" strokeWidth={0} aria-hidden="true" /> {ownNote.likeCount}</span>
            )}
          </span>
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
          <FeedItem key={n.id} n={n} index={i} onOpen={() => setViewingId(n.id)} onLike={onLike} />
        ))}

        {feedStatus === 'error' && <li className={styles.hint}>No pudimos cargar las notas de los demás.</li>}
        {feedStatus === 'ready' && feed.length === 0 && <li className={styles.hint}>Aún no hay notas de otros. ¡Sé el primero!</li>}
      </ul>

      <button type="button" className={`${styles.nav} ${styles.next}`} aria-label="Ver más notas" tabIndex={edge.next ? 0 : -1} aria-hidden={!edge.next} onClick={() => scrollBy(1)}>
        <ChevronRight size={18} strokeWidth={2.6} />
      </button>

      {viewing && <NoteViewer item={viewing} onClose={() => setViewingId(null)} onLike={onLike} />}
    </section>
  );
}
