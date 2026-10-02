import { useState } from 'react';
import { Plus, Send, X } from 'lucide-react';
import ScreenHeader from '../components/ScreenHeader';
import UserAvatar from '../components/UserAvatar';
import { usePulseSession } from '../context/PulseSession';
import { stories as seedStories } from '../data/app';
import styles from './Instantaneas.module.css';

export default function Instantaneas() {
  const { me } = usePulseSession();
  const [stories, setStories] = useState(seedStories);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const publish = () => {
    const text = draft.trim();
    if (!text) return;
    setStories([
      {
        id: `s${Date.now()}`,
        quote: text,
        author: 'Tú',
        meta: 'Sede 12va  |  ahora',
        photo: 'worship',
        img: seedStories[0].img,
      },
      ...stories,
    ]);
    setDraft('');
    setOpen(false);
  };

  return (
    <div className={`page-enter ${styles.page}`}>
      <ScreenHeader title="Instantáneas" back="/mas" />

      {open && (
        <div className={styles.composer}>
          <textarea
            className={styles.textarea}
            placeholder="¿Qué está pasando en el congreso?"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            autoFocus
          />
          <div className={styles.composerActions}>
            <button type="button" className={styles.cancel} onClick={() => setOpen(false)}>
              <X size={16} strokeWidth={2.4} />
              Cancelar
            </button>
            <button type="button" className={styles.publish} onClick={publish} disabled={!draft.trim()}>
              <Send size={15} strokeWidth={2.4} />
              Publicar
            </button>
          </div>
        </div>
      )}

      <div className={styles.feed}>
        {stories.map((s) => (
          <article key={s.id} className={styles.card}>
            <div className={styles.media}>
              <img className={styles.mediaFill} src={s.img} alt="" loading="lazy" />
              <p className={styles.quote}>{s.quote}</p>
            </div>
            <footer className={styles.meta}>
              <UserAvatar
                className={styles.metaAvatar}
                attendeeId={s.author === 'Tú' ? me?.attendee.id : null}
                name={s.author}
              />
              <span className={styles.metaAuthor}>{s.author}</span>
              <span className={styles.metaTime}>{s.meta}</span>
            </footer>
          </article>
        ))}
      </div>

      <button
        type="button"
        className={styles.fab}
        aria-label={open ? 'Cerrar' : 'Publicar instantánea'}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={22} strokeWidth={2.4} /> : <Plus size={24} strokeWidth={2.6} />}
      </button>
    </div>
  );
}
