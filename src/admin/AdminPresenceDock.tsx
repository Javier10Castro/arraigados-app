import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, MessageCircle, Send, X } from 'lucide-react';
import UserAvatar from '../components/UserAvatar';
import { useStaffSession } from '../context/StaffSession';
import { api, ApiRequestError } from '../lib/api';
import { ADMIN_SECTIONS } from './nav';
import type { AdminChatMessage, AdminConversation, AdminPresenceResponse, AdminThreadResponse } from '../../shared/api';
import s from './AdminPresenceDock.module.css';

/**
 * Esquina del panel de Admin (migración 020): quién está en línea, en qué sección, y chat entre cuentas Admin.
 *
 * - Cada ~15 s (solo con la pestaña visible) y al cambiar de pantalla manda un «latido» con la ruta actual.
 *   La respuesta trae quién está en línea y mis mensajes sin leer.
 * - Al abrir la esquina: lista de personas (primero las que están en línea, luego conversaciones anteriores aunque
 *   la persona no esté conectada). Tocar a alguien abre el CHAT con todo el historial (tipo WhatsApp); mientras está
 *   abierto se actualiza cada 4 s y los mensajes de esa persona se marcan leídos.
 * - Cada pantalla monta su propio <AdminShell>, así que el estado se guarda a nivel módulo (`memo`) para no
 *   parpadear ni cerrar el chat al navegar.
 * - Sin la migración 020 el servidor responde { available: false } y la esquina no se dibuja.
 */
const BEAT_MS = 15_000;
const CHAT_POLL_MS = 4_000;
const MAX = 300;
const memo: { data: AdminPresenceResponse | null; open: boolean; chatWith: { id: string; name: string } | null } = {
  data: null,
  open: false,
  chatWith: null,
};

/** Nombre de la sección a partir de la ruta (la coincidencia más larga). Secciones solo-propietario se ven como «Panel». */
export function sectionLabel(path: string, viewerIsOwner = false): string {
  if (path === '/admin/mas') return 'Más';
  const hit = ADMIN_SECTIONS.filter((x) => path === x.to || path.startsWith(`${x.to}/`)).sort((a, b) => b.to.length - a.to.length)[0];
  if (!hit || (hit.owner && !viewerIsOwner)) return 'Panel';
  return hit.label;
}

const ago = (sec: number) => (sec < 20 ? 'ahora' : sec < 60 ? `hace ${sec} s` : `hace ${Math.round(sec / 60)} min`);
const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
const dayKey = (iso: string) => new Date(iso).toDateString();
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoy';
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}
function shortWhen(iso: string) {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? hhmm(iso) : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}
const byTime = (a: AdminChatMessage, b: AdminChatMessage) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
function merge(prev: AdminChatMessage[], next: AdminChatMessage[]) {
  const map = new Map(prev.map((m) => [m.id, m]));
  for (const m of next) map.set(m.id, m);
  return [...map.values()].sort(byTime);
}

/** Chat con una persona: historial, «ver anteriores», composer y «Visto». */
function Chat({ withUser, viewerIsOwner, onBack, onClose, onError }: {
  withUser: { id: string; name: string };
  viewerIsOwner?: boolean;
  onBack: () => void;
  onClose: () => void;
  onError: (text: string) => void;
}) {
  const [thread, setThread] = useState<AdminThreadResponse['with'] | null>(null);
  const [msgs, setMsgs] = useState<AdminChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOld, setLoadingOld] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true); // pegado abajo: los mensajes nuevos bajan la vista
  const keepFrom = useRef<number | null>(null); // al cargar anteriores, conservar la posición
  const first = useRef(true);

  const load = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      const r = await api.adminThread(withUser.id);
      setThread(r.with);
      setMsgs((prev) => merge(prev, r.messages));
      if (first.current) setHasMore(r.hasMore); // en las actualizaciones se conserva lo que ya cargó «ver anteriores»
      first.current = false;
    } catch (err) {
      if (err instanceof ApiRequestError && err.httpStatus >= 400 && err.httpStatus < 500) onError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withUser.id]);

  useEffect(() => {
    setMsgs([]);
    setLoading(true);
    stick.current = true;
    first.current = true;
    void load();
    const id = window.setInterval(() => void load(), CHAT_POLL_MS);
    input.current?.focus();
    return () => window.clearInterval(id);
  }, [load]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (keepFrom.current !== null) {
      el.scrollTop = el.scrollHeight - keepFrom.current;
      keepFrom.current = null;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [msgs]);

  const older = async () => {
    if (!msgs.length || loadingOld) return;
    setLoadingOld(true);
    try {
      const r = await api.adminThread(withUser.id, msgs[0].createdAt);
      keepFrom.current = (box.current?.scrollHeight ?? 0) - (box.current?.scrollTop ?? 0);
      setMsgs((prev) => merge(prev, r.messages));
      setHasMore(r.hasMore);
    } catch (err) {
      onError(err instanceof ApiRequestError ? err.message : 'No se pudieron cargar los mensajes anteriores.');
    } finally {
      setLoadingOld(false);
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const r = await api.sendAdminMessage({ toUserId: withUser.id, body });
      stick.current = true;
      setMsgs((prev) => merge(prev, [r.message]));
      setText('');
    } catch (err) {
      onError(err instanceof ApiRequestError ? err.message : 'No se pudo enviar. Intenta de nuevo.');
    } finally {
      setSending(false);
      input.current?.focus();
    }
  };

  const lastMine = [...msgs].reverse().find((m) => m.fromMe);
  const canSend = thread?.canSend ?? true;
  const status = thread?.online ? `En ${sectionLabel(thread.online.path, viewerIsOwner)} · ${ago(thread.online.secondsAgo)}` : thread ? 'Desconectado' : '';

  return (
    <div className={s.chat}>
      <header className={s.chatHead}>
        <button type="button" className={s.close} aria-label="Volver" onClick={onBack}>
          <ChevronLeft size={18} />
        </button>
        <UserAvatar className={s.avatar} userId={withUser.id} name={withUser.name} />
        <span className={s.who}>
          <strong>{thread?.name ?? withUser.name}</strong>
          <small>
            {thread?.online && <i className={s.dot} />} {status}
          </small>
        </span>
        <button type="button" className={s.close} aria-label="Cerrar" onClick={onClose}>
          <X size={16} />
        </button>
      </header>

      <div
        ref={box}
        className={s.messages}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {hasMore && (
          <button type="button" className={s.older} onClick={() => void older()} disabled={loadingOld}>
            {loadingOld ? 'Cargando…' : 'Ver mensajes anteriores'}
          </button>
        )}
        {loading && msgs.length === 0 && <p className={s.chatEmpty}>Cargando…</p>}
        {!loading && msgs.length === 0 && (
          <p className={s.chatEmpty}>Aún no hay mensajes con {firstName(withUser.name)}. Escribe el primero.</p>
        )}
        {msgs.map((m, i) => {
          const newDay = i === 0 || dayKey(msgs[i - 1].createdAt) !== dayKey(m.createdAt);
          const grouped = !newDay && i > 0 && msgs[i - 1].fromMe === m.fromMe;
          return (
            <Fragment key={m.id}>
              {newDay && <span className={s.day}>{dayLabel(m.createdAt)}</span>}
              <div className={`${s.bubble} ${m.fromMe ? s.mine : s.theirs} ${grouped ? s.grouped : ''}`}>
                <p>{m.body}</p>
                <time>{hhmm(m.createdAt)}</time>
              </div>
              {m === lastMine && m.readAt && <span className={s.seen}>Visto {hhmm(m.readAt)}</span>}
            </Fragment>
          );
        })}
      </div>

      {canSend ? (
        <form className={s.composer} onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <textarea
            ref={input}
            rows={1}
            maxLength={MAX}
            value={text}
            placeholder={`Mensaje para ${firstName(withUser.name)}…`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button type="submit" className={s.sendBtn} disabled={!text.trim() || sending} aria-label="Enviar">
            <Send size={16} />
          </button>
          {text.length > MAX - 60 && <small className={s.counter}>{[...text].length}/{MAX}</small>}
        </form>
      ) : (
        <p className={s.readonly}>Esta cuenta ya no es Admin: solo puedes ver el historial.</p>
      )}
    </div>
  );
}

export default function AdminPresenceDock() {
  const { pathname } = useLocation();
  const { user } = useStaffSession();
  const [data, setData] = useState<AdminPresenceResponse | null>(memo.data);
  const [open, setOpenState] = useState(memo.open);
  const [chatWith, setChatState] = useState(memo.chatWith);
  const [convs, setConvs] = useState<AdminConversation[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const setOpen = (v: boolean) => {
    memo.open = v;
    setOpenState(v);
  };
  const setChat = (v: { id: string; name: string } | null) => {
    memo.chatWith = v;
    setChatState(v);
  };

  const loadConvs = useCallback(async () => {
    try {
      const r = await api.adminConversations();
      if (r.available) setConvs(r.conversations);
    } catch {
      // se reintenta en el siguiente latido
    }
  }, []);

  const beat = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      const r = await api.adminPresence(pathRef.current);
      memo.data = r;
      setData(r);
    } catch {
      // Sin red o sesión vencida: se reintenta en el siguiente latido; la sesión la maneja el resto del panel.
    }
    if (memo.open && !memo.chatWith) void loadConvs();
  }, [loadConvs]);

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
    if (open && !chatWith) void loadConvs();
  }, [open, chatWith, loadConvs]);
  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 4000);
    return () => window.clearTimeout(id);
  }, [note]);

  // Lista: primero quienes están en línea (yo arriba), luego conversaciones con gente desconectada.
  const rows = useMemo(() => {
    if (!data?.available) return [];
    const conv = new Map(convs.map((c) => [c.userId, c]));
    const online = data.online.map((p) => ({ id: p.userId, name: p.name, me: p.me, online: p, conv: conv.get(p.userId) ?? null }));
    const ids = new Set(online.map((x) => x.id));
    const offline = convs.filter((c) => !ids.has(c.userId)).map((c) => ({ id: c.userId, name: c.name, me: false, online: null, conv: c }));
    return [...online, ...offline];
  }, [data, convs]);

  if (!data?.available || !user) return null;

  const inbox = data.inbox.filter((m) => !hidden.has(m.id) && m.fromUserId !== (open ? chatWith?.id : undefined));
  const unread = data.inbox.filter((m) => !hidden.has(m.id)).length;
  const count = data.online.length;

  const dismiss = (ids: string[]) => {
    setHidden((h) => new Set([...h, ...ids]));
    void api.readAdminMessages(ids).catch(() => undefined);
  };
  const openChat = (id: string, name: string) => {
    // Al abrir el chat el servidor marca leídos sus mensajes; se ocultan ya para que la tarjeta no reaparezca.
    setHidden((h) => new Set([...h, ...data.inbox.filter((m) => m.fromUserId === id).map((m) => m.id)]));
    setChat({ id, name });
    setOpen(true);
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
                <time>{hhmm(m.createdAt)}</time>
              </span>
              <p>{m.body}</p>
              <span className={s.toastActions}>
                {m.fromUserId && (
                  <button type="button" className={s.primary} onClick={() => openChat(m.fromUserId!, m.fromName)}>
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
        <section className={`${s.panel} ${chatWith ? s.panelChat : ''}`} aria-label={chatWith ? `Chat con ${chatWith.name}` : 'Admin en línea'}>
          {chatWith ? (
            <Chat
              key={chatWith.id}
              withUser={chatWith}
              viewerIsOwner={user.isOwner}
              onBack={() => setChat(null)}
              onClose={() => setOpen(false)}
              onError={(t) => setNote(t)}
            />
          ) : (
            <>
              <header className={s.panelHead}>
                <strong>Admin en línea</strong>
                <button type="button" className={s.close} aria-label="Cerrar" onClick={() => setOpen(false)}>
                  <X size={16} />
                </button>
              </header>
              <ul className={s.people}>
                {rows.map((p, i) => {
                  const firstOffline = !p.online && (i === 0 || rows[i - 1].online);
                  const sub = p.online
                    ? `${sectionLabel(p.online.path, user.isOwner)} · ${ago(p.online.secondsAgo)}`
                    : p.conv
                      ? `${p.conv.lastFromMe ? 'Tú: ' : ''}${p.conv.lastBody}`
                      : '';
                  const inner = (
                    <>
                      <UserAvatar className={s.avatar} userId={p.id} name={p.name} />
                      <span className={s.who}>
                        <strong>
                          {p.name}
                          {p.me && <em> (tú)</em>}
                        </strong>
                        <small>
                          {p.online && <i className={s.dot} />}
                          <span className={s.ellipsis}>{sub}</span>
                        </small>
                      </span>
                      {!p.me && (
                        <span className={s.rowEnd}>
                          {p.conv && <time>{shortWhen(p.conv.lastAt)}</time>}
                          {p.conv && p.conv.unread > 0 ? <b className={s.rowBadge}>{p.conv.unread}</b> : <ChevronRight size={16} />}
                        </span>
                      )}
                    </>
                  );
                  return (
                    <Fragment key={p.id}>
                      {firstOffline && <li className={s.sep}>Conversaciones</li>}
                      <li>
                        {p.me ? (
                          <div className={s.person}>{inner}</div>
                        ) : (
                          <button type="button" className={`${s.person} ${s.personBtn}`} onClick={() => openChat(p.id, p.name)}>
                            {inner}
                          </button>
                        )}
                      </li>
                    </Fragment>
                  );
                })}
                {rows.length <= 1 && <li className={s.empty}>Nadie más está en el panel ahorita.</li>}
              </ul>
            </>
          )}
        </section>
      )}

      {note && <p className={`${s.note} ${s.noteErr}`} role="status">{note}</p>}

      <button
        type="button"
        className={`${s.pill} ${open ? s.pillOpen : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`${count} Admin en línea${unread ? `, ${unread} mensajes sin leer` : ''}`}
      >
        <span className={s.stack}>
          {data.online.slice(0, 3).map((p) => (
            <UserAvatar key={p.userId} className={s.mini} userId={p.userId} name={p.name} />
          ))}
        </span>
        <span className={s.pillText}>
          <i className={s.dot} /> {count} en línea
        </span>
        {unread > 0 && <b className={s.badge}>{unread >= 20 ? '20+' : unread}</b>}
      </button>
    </div>
  );
}
