import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle, Send, X } from 'lucide-react';
import UserAvatar from '../components/UserAvatar';
import { useStaffSession } from '../context/StaffSession';
import { api, ApiRequestError } from '../lib/api';
import { ADMIN_SECTIONS } from './nav';
import type { AdminPresenceResponse } from '../../shared/api';
import s from './AdminPresenceDock.module.css';

/**
 * Esquina del panel de Admin (migración 020): quién está en línea, en qué sección, y mensajes cortos entre Admin.
 *
 * - Cada ~15 s (solo con la pestaña visible) y al cambiar de pantalla manda un «latido» con la ruta actual.
 *   La respuesta trae quién está en línea y mis mensajes sin leer; no hay otra consulta.
 * - Cada pantalla monta su propio <AdminShell>, así que el último estado se guarda a nivel módulo (`last`) para que
 *   la esquina no parpadee al navegar.
 * - Sin la migración 020 el servidor responde { available: false } y la esquina no se dibuja.
 * - Los mensajes recibidos salen como tarjeta: «Responder» abre el chat con esa persona; «Listo» la marca leída.
 */
const BEAT_MS = 15_000;
const MAX = 300;
let last: AdminPresenceResponse | null = null;

/** Nombre de la sección a partir de la ruta (la coincidencia más larga). Secciones solo-propietario se ven como «Panel». */
export function sectionLabel(path: string, viewerIsOwner = false): string {
  if (path === '/admin/mas') return 'Más';
  const hit = ADMIN_SECTIONS.filter((x) => path === x.to || path.startsWith(`${x.to}/`)).sort((a, b) => b.to.length - a.to.length)[0];
  if (!hit || (hit.owner && !viewerIsOwner)) return 'Panel';
  return hit.label;
}

const ago = (sec: number) => (sec < 20 ? 'ahora' : sec < 60 ? `hace ${sec} s` : `hace ${Math.round(sec / 60)} min`);
const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;

export default function AdminPresenceDock() {
  const { pathname } = useLocation();
  const { user } = useStaffSession();
  const [data, setData] = useState<AdminPresenceResponse | null>(last);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<{ id: string; name: string } | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const input = useRef<HTMLTextAreaElement>(null);

  const beat = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      const r = await api.adminPresence(pathRef.current);
      last = r;
      setData(r);
    } catch {
      // Sin red o sesión vencida: se reintenta en el siguiente latido; la sesión la maneja el resto del panel.
    }
  }, []);

  useEffect(() => {
    void beat();
  }, [pathname, beat]);
  useEffect(() => {
    const id = window.setInterval(() => void beat(), BEAT_MS);
    const onVis = () => document.visibilityState === 'visible' && void beat();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [beat]);

  useEffect(() => {
    if (to) input.current?.focus();
  }, [to]);
  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 3500);
    return () => window.clearTimeout(id);
  }, [note]);

  if (!data?.available || !user) return null;

  const others = data.online.filter((x) => !x.me);
  const inbox = data.inbox.filter((m) => !hidden.has(m.id));
  const count = data.online.length;

  const dismiss = (ids: string[]) => {
    setHidden((h) => new Set([...h, ...ids]));
    void api.readAdminMessages(ids).catch(() => undefined);
  };
  const reply = (m: AdminPresenceResponse['inbox'][number]) => {
    dismiss([m.id]);
    if (m.fromUserId) {
      setTo({ id: m.fromUserId, name: m.fromName });
      setOpen(true);
    }
  };
  const send = async () => {
    const body = text.trim();
    if (!to || !body || sending) return;
    setSending(true);
    try {
      await api.sendAdminMessage({ toUserId: to.id, body });
      setNote({ ok: true, text: `Mensaje enviado a ${firstName(to.name)}.` });
      setText('');
      setTo(null);
    } catch (err) {
      setNote({ ok: false, text: err instanceof ApiRequestError ? err.message : 'No se pudo enviar. Intenta de nuevo.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={s.dock}>
      {inbox.length > 0 && (
        <ul className={s.toasts} aria-live="polite">
          {inbox.slice(-3).map((m) => (
            <li key={m.id} className={s.toast}>
              <span className={s.toastHead}>
                <MessageCircle size={15} />
                <strong>{m.fromName}</strong>
                <time>{new Date(m.createdAt).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}</time>
              </span>
              <p>{m.body}</p>
              <span className={s.toastActions}>
                {m.fromUserId && (
                  <button type="button" className={s.primary} onClick={() => reply(m)}>
                    Responder
                  </button>
                )}
                <button type="button" className={s.ghost} onClick={() => dismiss([m.id])}>
                  Listo
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <section className={s.panel} aria-label="Admin en línea">
          <header className={s.panelHead}>
            <strong>Admin en línea</strong>
            <button type="button" className={s.close} aria-label="Cerrar" onClick={() => { setOpen(false); setTo(null); }}>
              <X size={16} />
            </button>
          </header>

          {to ? (
            <form className={s.compose} onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <span className={s.composeTo}>
                Para <strong>{to.name}</strong>
                <button type="button" className={s.link} onClick={() => setTo(null)}>Cambiar</button>
              </span>
              <textarea
                ref={input}
                rows={3}
                maxLength={MAX}
                value={text}
                placeholder="Escribe tu mensaje…"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <span className={s.composeFoot}>
                <small>{[...text].length}/{MAX}</small>
                <button type="submit" className={s.primary} disabled={!text.trim() || sending}>
                  <Send size={14} /> {sending ? 'Enviando…' : 'Enviar'}
                </button>
              </span>
            </form>
          ) : (
            <ul className={s.people}>
              {data.online.map((p) => (
                <li key={p.userId} className={s.person}>
                  <UserAvatar className={s.avatar} userId={p.userId} name={p.name} />
                  <span className={s.who}>
                    <strong>
                      {p.name}
                      {p.me && <em> (tú)</em>}
                    </strong>
                    <small>
                      <i className={s.dot} /> {sectionLabel(p.path, user.isOwner)} · {ago(p.secondsAgo)}
                    </small>
                  </span>
                  {!p.me && (
                    <button type="button" className={s.msgBtn} onClick={() => setTo({ id: p.userId, name: p.name })}>
                      Mensaje
                    </button>
                  )}
                </li>
              ))}
              {others.length === 0 && <li className={s.empty}>Nadie más está en el panel ahorita.</li>}
            </ul>
          )}
        </section>
      )}

      {note && <p className={`${s.note} ${note.ok ? '' : s.noteErr}`} role="status">{note.text}</p>}

      <button
        type="button"
        className={`${s.pill} ${open ? s.pillOpen : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${count} Admin en línea`}
      >
        <span className={s.stack}>
          {data.online.slice(0, 3).map((p) => (
            <UserAvatar key={p.userId} className={s.mini} userId={p.userId} name={p.name} />
          ))}
        </span>
        <span className={s.pillText}>
          <i className={s.dot} /> {count} en línea
        </span>
        {inbox.length > 0 && <b className={s.badge}>{inbox.length}</b>}
      </button>
    </div>
  );
}
