import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Pencil, X } from 'lucide-react';
import { BLOCKED_LANGUAGE_MESSAGE, hasBlockedLanguage } from '../../../shared/moderation';
import { NOTE_LIFETIME_HOURS, NOTE_MAX_LENGTH, type Note } from '../../../shared/api';
import LikeBadge from './LikeBadge';
import { api } from '../../lib/api';
import UserAvatar from '../UserAvatar';
import type { NoteLiker } from '../../../shared/api';
import Button from '../Button';
import type { NotesStatus } from './useMyNotes';
import styles from './NoteSheet.module.css';

/**
 * Panel de la Nota (5 oct 2026): hoja inferior en celular, tarjeta centrada en
 * pantallas ≥ 640 px (mismo patrón que los modales de Menú/Mercancía).
 *
 * Vistas internas:
 *   empty   -> sin nota activa: "¿Qué tienes en mente?" + "Escribir una nota"
 *   view    -> nota activa: se muestra con "Cambiar nota" / "Quitar nota"
 *   edit    -> editor (máx. NOTE_MAX_LENGTH) con contador y vista previa
 *   error   -> no se pudo cargar; "Reintentar"
 *
 * "Quitar nota" (DELETE /api/notes) hace expirar la nota activa ya; la fila se
 * queda vencida y se conserva como historial (se revisa en Admin → Notas).
 */

type View = 'empty' | 'view' | 'edit' | 'error';

type Props = {
  status: NotesStatus;
  error: string;
  token: string;
  active: Note | null;
  now: number;
  onPublish: (text: string) => Promise<Note>;
  onRemove: () => Promise<void>;
  onReload: () => void;
  onClose: () => void;
};

function initialView(status: NotesStatus, active: Note | null): View {
  if (status === 'error') return 'error';
  return active ? 'view' : 'empty';
}

/** "se desvanece en 5 h" / "en 35 min" / "en menos de 1 min". */
export function remaining(expiresAt: string, now: number) {
  const mins = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 60000));
  if (mins < 1) return 'menos de 1 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.round(mins / 60);
  return `${h} h`;
}

export default function NoteSheet({ status, error, token, active, now, onPublish, onRemove, onReload, onClose }: Props) {
  const [view, setView] = useState<View>(() => initialView(status, active));
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [done, setDone] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [likers, setLikers] = useState<NoteLiker[]>([]);
  const likeCount = active?.likeCount ?? 0;
  useEffect(() => {
    if (!token || !active || likeCount === 0) {
      setLikers([]);
      return;
    }
    let off = false;
    api.noteLikers(token).then((r) => !off && setLikers(r.likers)).catch(() => {});
    return () => {
      off = true;
    };
  }, [token, active?.id, likeCount]);
  const [formError, setFormError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Si el estado de carga cambia con el panel abierto (p. ej. "Reintentar"),
  // se reacomoda la vista -- salvo que la persona ya esté escribiendo.
  useEffect(() => {
    setView((v) => (v === 'edit' ? v : initialView(status, active)));
  }, [status, active]);

  // `onClose` llega como función nueva en cada render de /home (que se vuelve
  // a dibujar cada segundo por la cuenta regresiva). Si el efecto dependiera de
  // ella, el foco se robaba al <div> del panel cada segundo y el textarea
  // perdía el cursor mientras se escribía. Se guarda en un ref y los efectos
  // corren UNA sola vez.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    // Con el panel abierto la página de fondo no debe desplazarse.
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

  useEffect(() => {
    if (view === 'edit') areaRef.current?.focus({ preventScroll: true });
  }, [view]);

  const startEdit = () => {
    setDraft('');
    setFormError('');
    setView('edit');
  };

  const clean = draft.trim();
  const blocked = hasBlockedLanguage(clean);
  const canPublish = clean.length > 0 && clean.length <= NOTE_MAX_LENGTH && !blocked && !posting && !done;

  const publish = async () => {
    if (blocked) {
      setFormError(BLOCKED_LANGUAGE_MESSAGE);
      return;
    }
    if (!canPublish) return;
    setPosting(true);
    setFormError('');
    try {
      await onPublish(clean);
      setDone(true);
      window.setTimeout(() => onCloseRef.current(), 650); // deja ver el "¡Listo!" y cierra
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'No pudimos publicar tu nota. Intenta de nuevo.');
      setPosting(false);
    }
  };

  const removeNote = async () => {
    if (removing) return;
    setRemoving(true);
    setFormError('');
    try {
      await onRemove();
      onCloseRef.current();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'No pudimos quitar tu nota. Intenta de nuevo.');
      setRemoving(false);
    }
  };

  const left = NOTE_MAX_LENGTH - draft.length;
  const nearLimit = left <= 10; // últimos 10: ámbar + "quedan N"
  const atLimit = left <= 0; // tope: rojo

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-sheet-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={styles.grip} aria-hidden="true" />
        <button type="button" className={styles.close} aria-label="Cerrar" onClick={onClose}>
          <X size={18} strokeWidth={2.4} />
        </button>

        {view === 'empty' && (
          <div className={styles.body} key="empty">
            <h2 id="note-sheet-title" className={styles.title}>¿Qué tienes en mente?</h2>
            <p className={styles.lead}>
              Una frase, un versículo o una oración corta. La verán los demás asistentes junto a tu avatar durante {NOTE_LIFETIME_HOURS} horas.
            </p>
            <div className={styles.actions}>
              <Button block onClick={startEdit}>
                <Pencil size={16} strokeWidth={2.4} /> Escribir una nota
              </Button>
            </div>
          </div>
        )}

        {view === 'view' && active && (
          <div className={styles.body} key="view">
            <h2 id="note-sheet-title" className={styles.title}>Tu nota</h2>
            <p className={styles.preview}>
              {active.text}
            </p>
            <p className={styles.meta}>
              Se desvanece en {remaining(active.expiresAt, now)}
              {active.likeCount > 0 && (
                <>
                  {' · '}
                  <LikeBadge size={16} count={active.likeCount} />
                </>
              )}
            </p>
            {likers.length > 0 && (
              <ul className={styles.likers} aria-label="Personas a las que les gustó tu nota">
                {likers.map((p) => (
                  <li key={p.attendeeId} className={styles.liker}>
                    <UserAvatar size={36} attendeeId={p.attendeeId} name={p.firstName} />
                    <span className={styles.likerName}>{p.firstName}</span>
                    <LikeBadge size={22} />
                  </li>
                ))}
              </ul>
            )}
            {formError && <p className={styles.error} role="alert">{formError}</p>}
            <div className={styles.actionsRow}>
              <Button variant="outline" onClick={() => void removeNote()} disabled={removing}>
                {removing ? 'Quitando…' : 'Quitar nota'}
              </Button>
              <Button onClick={startEdit} disabled={removing}>Cambiar nota</Button>
            </div>
          </div>
        )}

        {view === 'edit' && (
          <form
            className={styles.body}
            key="edit"
            onSubmit={(e) => {
              e.preventDefault();
              void publish();
            }}
          >
            <h2 id="note-sheet-title" className={styles.title}>{active ? 'Cambiar nota' : 'Escribe tu nota'}</h2>

            <label className={styles.field}>
              <span className={styles.srOnly}>Texto de la nota</span>
              <textarea
                ref={areaRef}
                className={styles.area}
                rows={2}
                maxLength={NOTE_MAX_LENGTH}
                value={draft}
                placeholder="Dios sigue obrando…"
                // Una nota es una sola frase: sin saltos de línea (Enter publica).
                onChange={(e) => setDraft(e.target.value.replace(/\s*[\r\n]+\s*/g, ' '))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void publish();
                  }
                }}
                disabled={posting || done}
              />
              <span className={`${styles.counter} ${atLimit ? styles.counterMax : nearLimit ? styles.counterWarn : ''}`}>
                {nearLimit && (
                  <span className={styles.counterLeft} role="status" aria-live="polite">
                    {atLimit ? 'Límite' : `Quedan ${left}`}
                  </span>
                )}
                {draft.length} / {NOTE_MAX_LENGTH}
              </span>
            </label>

            {(blocked || formError) && (
              <p className={styles.error} role="alert">{blocked ? BLOCKED_LANGUAGE_MESSAGE : formError}</p>
            )}

            <div className={styles.actionsRow}>
              <Button variant="outline" onClick={() => setView(active ? 'view' : 'empty')} disabled={posting || done}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!canPublish} className={done ? styles.doneBtn : ''}>
                {done ? (
                  <>
                    <Check size={17} strokeWidth={3} /> ¡Listo!
                  </>
                ) : posting ? (
                  'Publicando…'
                ) : (
                  'Publicar nota'
                )}
              </Button>
            </div>
          </form>
        )}

        {view === 'error' && (
          <div className={styles.body} key="error">
            <h2 id="note-sheet-title" className={styles.title}>No pudimos cargar tu nota</h2>
            <p className={styles.lead}>{error || 'Revisa tu conexión e inténtalo de nuevo.'}</p>
            <div className={styles.actions}>
              <Button block onClick={onReload}>Reintentar</Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
