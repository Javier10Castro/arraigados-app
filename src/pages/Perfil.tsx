import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { blobatar } from 'blobatar';
import { Camera, ChevronDown, Loader2, Shuffle, Trash2 } from 'lucide-react';
import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';
import BloBatar from '../components/BloBatar';
import ColorBox from '../components/ColorBox';
import UserAvatar from '../components/UserAvatar';
import { useAppSettings } from '../context/AppSettings';
import { setMyProfile, useProfile } from '../context/ProfileDirectory';
import { initials, usePulseSession } from '../context/PulseSession';
import { api } from '../lib/api';
import { PhotoError, preparePhoto } from '../lib/profilePhoto';
import {
  INITIALS_MAX_PARTS,
  OWN_AVATAR_ID,
  customAvatarId,
  customAvatarSeed,
  galleryAvatar,
  customInitials,
  initialsBackground,
  initialsStyleId,
  nameWords,
  parseCustomAvatar,
  parseInitialsStyle,
  shapeCenter,
  type AttendeeProfileView,
  type CustomAvatar,
  type ProfileKind,
} from '../../shared/profile';
import styles from './Perfil.module.css';

/**
 * /perfil -- "Mi perfil": el asistente elige cómo se ve en toda la app.
 *   Foto      -> sube una foto propia (se recorta en cuadrado y se reduce en el navegador)
 *   Avatar    -> lo arma él mismo con pocas opciones (forma, ojos, color y matiz), en tarjetas plegables
 *   Iniciales -> de su nombre, eligiendo qué palabras usar y el color; se actualizan solas si el nombre cambia
 * Las TRES elecciones se conservan: solo una está ACTIVA (la que ven los demás); las otras quedan «guardadas»
 * por si quiere volver a ellas. La foto solo se reemplaza al subir otra o al pulsar «Eliminar foto».
 * Nada cambia hasta pulsar "Guardar". Si guardar falla, lo que ya tenía guardado no se toca.
 */

const TABS: { kind: ProfileKind; label: string }[] = [
  { kind: 'photo', label: 'Foto' },
  { kind: 'avatar', label: 'Avatar' },
  { kind: 'initials', label: 'Iniciales' },
];
const KIND_NAME: Record<ProfileKind, string> = { photo: 'tu foto', avatar: 'tu avatar', initials: 'tus iniciales' };
/** Concordancia de «guardado/inactivo» según la opción. */
const KIND_STATE: Record<ProfileKind, string> = { photo: 'está guardada pero inactiva', avatar: 'está guardado pero inactivo', initials: 'están guardadas pero inactivas' };

/* Pocas opciones a propósito: lo suficiente para sentirse propio sin abrumar. */
/** Siluetas de Blobatar (0-9) que más se distinguen: redonda, cuadrada, cápsula, con bultos, nube y engrane. */
const SHAPES = [0, 5, 6, 7, 8, 9];
/** Rostros: cada uno cambia el tamaño, separación e inclinación de los ojos. */
const FACES = [10, 14, 17, 21, 22, 32];
/** Colores rápidos (tono 0-359): índigo de la marca, violetas, rosas, cálidos y verdes/turquesa. */
const COLORS = [225, 275, 330, 355, 20, 45, 140, 175];
/** Matices de Blobatar: su escala interna tiene solo 6 tonos reales y NO va de claro a oscuro (el «brillante» casi
 *  se confunde con el pastel), así que se ofrecen los 5 que sí se distinguen, de claro a oscuro. */
const TONES = [
  { label: 'Pastel', v: 5 },
  { label: 'Apagado', v: 28 },
  { label: 'Vivo', v: 50 },
  { label: 'Profundo', v: 70 },
  { label: 'Oscuro', v: 96 },
];
/** Color real del cuerpo del avatar para un tono y matiz (lo calcula la propia librería: lo que ves es lo que queda). */
const bodyColor = (hue: number, tone: number) => /#[0-9a-f]{6}/i.exec(blobatar('color', { hue, tone: tone / 100 }))?.[0] ?? `hsl(${hue} 60% 60%)`;
const DEFAULT_CUSTOM: CustomAvatar = { face: FACES[1]!, shape: shapeCenter(8), hue: 225, tone: 50 };
/** Índice de la franja de matiz más cercana a un tono (por si guardó uno que ya no se ofrece). */
const nearestTone = (tone: number) => TONES.reduce((best, t, i) => (Math.abs(t.v - tone) < Math.abs(TONES[best]!.v - tone) ? i : best), 0);

type AvatarMode = 'default' | 'random' | 'custom';
const AV_MODES: { mode: AvatarMode; label: string }[] = [
  { mode: 'default', label: 'Default' },
  { mode: 'random', label: 'Sorpréndeme' },
  { mode: 'custom', label: 'Custom' },
];

type Draft = {
  kind: ProfileKind;
  /** Avatar: diseño propio (`c.…`); también puede venir de un avatar de galería o 'own' guardado antes. */
  avatarId: string;
  /** Iniciales: '' = las de siempre; si no, estilo (`i.…`). */
  initialsId: string;
  photo: { blob: Blob; url: string } | null;
};

/** Tarjeta plegable: solo una abierta a la vez; el encabezado resume lo elegido. */
function Section({ id, title, summary, open, onToggle, children }: { id: string; title: string; summary?: ReactNode; open: boolean; onToggle: (id: string) => void; children: ReactNode }) {
  return (
    <div className={`${styles.card} ${open ? styles.cardOpen : ''}`}>
      <button type="button" className={styles.cardHead} aria-expanded={open} aria-controls={`sec-${id}`} onClick={() => onToggle(id)}>
        <span className={styles.cardTitle}>{title}</span>
        {summary && <span className={styles.cardSummary}>{summary}</span>}
        <ChevronDown size={18} className={styles.chevron} aria-hidden="true" />
      </button>
      {open && (
        <div id={`sec-${id}`} className={styles.cardBody}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function Perfil() {
  const { state, me } = usePulseSession();
  const { avatarMode } = useAppSettings();
  const attendeeId = me?.attendee.id ?? null;
  const fullName = me?.attendee.fullName ?? '';
  const saved = useProfile(attendeeId);
  const token = state.phase === 'ready' ? state.token : '';

  // Punto de partida: lo guardado; si nunca eligió, lo que ve hoy (el avatar de siempre o las iniciales).
  const base = useMemo<{ kind: ProfileKind; avatarId: string; initialsId: string }>(
    () => ({
      kind: saved?.kind ?? (avatarMode === 'initials' ? 'initials' : 'avatar'),
      avatarId: saved?.avatarId ?? OWN_AVATAR_ID,
      initialsId: saved?.initialsId ?? '',
    }),
    [saved, avatarMode],
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const d: Draft = draft ?? { ...base, photo: null };
  const words = nameWords(fullName);
  const hasSavedPhoto = Boolean(saved?.photoUrl);

  const [busy, setBusy] = useState<'photo' | 'save' | 'remove' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  // Modo del avatar en pantalla: 'random' solo existe mientras se está sorprendiendo (el avatar guardado es siempre default o custom).
  const [avModeOv, setAvModeOv] = useState<AvatarMode | null>(null);
  // Al cambiar de pestaña se abre la primera tarjeta de esa pestaña.
  useEffect(() => setOpen(d.kind === 'avatar' ? 'forma' : d.kind === 'initials' ? 'palabras' : null), [d.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const fileRef = useRef<HTMLInputElement>(null);
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));

  // Libera la vista previa local al reemplazarla o salir.
  useEffect(() => () => void (draft?.photo && URL.revokeObjectURL(draft.photo.url)), [draft?.photo]);
  useEffect(() => {
    if (!msg?.ok) return;
    const t = window.setTimeout(() => setMsg(null), 3500);
    return () => window.clearTimeout(t);
  }, [msg]);

  const update = (patch: Partial<Draft>) => {
    setMsg(null);
    setDraft({ ...d, ...patch });
  };

  const choosePhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy('photo');
    setMsg(null);
    try {
      const blob = await preparePhoto(file);
      setDraft({ ...d, kind: 'photo', photo: { blob, url: URL.createObjectURL(blob) } });
      setConfirmRemove(false);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof PhotoError ? err.message : 'No pudimos preparar esa foto. Prueba con otra.' });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Cambios pendientes: la opción activa, o cualquier selección editada (aunque no sea la activa).
  const dirty = draft !== null && (d.kind !== base.kind || d.avatarId !== base.avatarId || d.initialsId !== base.initialsId || d.photo !== null);
  const canSave = dirty && (d.kind !== 'photo' || d.photo !== null || hasSavedPhoto) && !busy;

  const save = async () => {
    if (!canSave || !attendeeId) return;
    setBusy('save');
    setMsg(null);
    try {
      const form = new FormData();
      form.set('kind', d.kind);
      if (d.kind === 'avatar' || d.avatarId !== base.avatarId) form.set('avatarId', d.avatarId);
      if (d.initialsId !== base.initialsId) form.set('initialsId', d.initialsId);
      if (d.photo) form.set('photo', new File([d.photo.blob], 'perfil.jpg', { type: 'image/jpeg' }));
      const r = await api.saveProfile(token, form);
      if (r.profile) setMyProfile(attendeeId, r.profile);
      setDraft(null);
      setAvModeOv(null);
      setMsg({ ok: true, text: `Listo, ahora usas ${KIND_NAME[d.kind]}.` });
    } catch (err) {
      setMsg({ ok: false, text: `${err instanceof Error ? err.message : 'No se pudo guardar.'} Tu perfil anterior sigue igual.` });
    } finally {
      setBusy(null);
    }
  };

  /** Elimina la foto guardada (única vía, además de subir otra, para que el archivo se borre). */
  const removePhoto = async () => {
    if (!attendeeId || !saved) return;
    setBusy('remove');
    setMsg(null);
    try {
      const form = new FormData();
      // Si la foto era la activa, pasa a lo que tenga guardado (avatar) o a las iniciales.
      form.set('kind', saved.kind === 'photo' ? (saved.avatarId ? 'avatar' : 'initials') : saved.kind);
      form.set('removePhoto', '1');
      const r = await api.saveProfile(token, form);
      if (r.profile) setMyProfile(attendeeId, r.profile);
      setDraft(null);
      setConfirmRemove(false);
      setMsg({ ok: true, text: 'Tu foto se eliminó.' });
    } catch (err) {
      setMsg({ ok: false, text: `${err instanceof Error ? err.message : 'No se pudo eliminar la foto.'} Tu foto sigue guardada.` });
    } finally {
      setBusy(null);
    }
  };

  // Lo que se ve en la vista previa (antes de guardar).
  const previewPhoto = d.photo?.url ?? saved?.photoUrl ?? null;
  const preview: AttendeeProfileView =
    d.kind === 'photo'
      ? { kind: 'photo', avatarId: null, initialsId: null, photoUrl: previewPhoto }
      : d.kind === 'avatar'
        ? { kind: 'avatar', avatarId: d.avatarId, initialsId: null, photoUrl: null }
        : { kind: 'initials', avatarId: null, initialsId: d.initialsId || null, photoUrl: null };
  const previewIsEmptyPhoto = d.kind === 'photo' && !previewPhoto;

  /* ---- Estado de cada opción: activa / guardada ---- */
  const stored: Record<ProfileKind, boolean> = { photo: hasSavedPhoto, avatar: Boolean(saved?.avatarId), initials: Boolean(saved?.initialsId) };
  const status = (k: ProfileKind) => (saved?.kind === k ? 'Activo' : stored[k] ? 'Guardado' : '');
  const inactiveNote = saved && d.kind !== saved.kind && stored[d.kind] && !(d.kind === 'photo' && d.photo);

  /* ---- Avatar: lo arma con pocas opciones ---- */
  const custom = parseCustomAvatar(d.avatarId);
  const cur: CustomAvatar = custom ?? { ...DEFAULT_CUSTOM, hue: galleryAvatar(d.avatarId)?.hue ?? DEFAULT_CUSTOM.hue };
  const curRow = nearestTone(cur.tone);
  const setCustom = (patch: Partial<CustomAvatar>) => update({ kind: 'avatar', avatarId: customAvatarId({ ...cur, ...patch }) });
  const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!;
  const avMode: AvatarMode = avModeOv ?? (custom ? 'custom' : 'default');
  /** Default: el avatar de Blobatar que sale del nombre (sin personalizar). */
  const chooseDefault = () => {
    setAvModeOv('default');
    update({ kind: 'avatar', avatarId: OWN_AVATAR_ID });
  };
  /** Sorpréndeme: uno al azar (cada pulsación da otro). */
  const shuffle = () => {
    setAvModeOv('random');
    setCustom({ face: pick(FACES), shape: shapeCenter(pick(SHAPES)), hue: pick(COLORS), tone: pick(TONES).v });
  };
  /** Custom: arranca con lo que se ve ahora (si venía de Default o Sorpréndeme, lo toma como punto de partida). */
  const chooseCustom = () => {
    setAvModeOv('custom');
    setCustom({});
  };

  /* ---- Iniciales: qué palabras del nombre y color ---- */
  const style = parseInitialsStyle(d.initialsId);
  const lastIdx = Math.min(Math.max(words.length - 1, 0), 5);
  const parts = style?.parts ?? (words.length > 1 ? [0, lastIdx] : [0]);
  const hueSel = style?.hue ?? null;
  const setInitials = (nextParts: number[], hue: number | null) => update({ kind: 'initials', initialsId: initialsStyleId({ parts: nextParts, hue }) });
  const togglePart = (i: number) => {
    const has = parts.includes(i);
    if (has && parts.length === 1) return; // al menos una letra
    if (!has && parts.length >= INITIALS_MAX_PARTS) return;
    setInitials(has ? parts.filter((p) => p !== i) : [...parts, i].sort((a, b) => a - b), hueSel);
  };
  const initialsText = customInitials(fullName, parts) || initials(fullName);

  const miniBlob = (shape: number, face: number) => <BloBatar name={customAvatarSeed(face)} hue={cur.hue} shape={shape / 100} tone={cur.tone / 100} size={34} />;

  return (
    <div className={`page-enter ${styles.page}`}>
      <ScreenHeader title="Mi perfil" back="/mas" />

      {/* Un solo selector de archivos, compartido por la vista previa y el botón del panel. */}
      <input ref={fileRef} type="file" accept="image/*" className="sr-only" id="perfil-foto" tabIndex={-1} onChange={(e) => void choosePhoto(e.target.files?.[0])} />

      {/* Escritorio: dos mitades (vista previa grande | opciones). Móvil: una debajo de otra. */}
      <div className={styles.layout}>
        <section className={styles.hero} aria-label="Vista previa">
          <div className={styles.avatarWrap}>
            {previewIsEmptyPhoto ? (
              // Sin foto aún: el círculo punteado ES el botón para elegirla.
              <button type="button" className={styles.emptyPhoto} onClick={() => fileRef.current?.click()} disabled={busy !== null} aria-label="Elegir una foto">
                {busy === 'photo' ? <Loader2 size={40} className={styles.spin} aria-hidden="true" /> : <Camera size={40} strokeWidth={1.8} aria-hidden="true" />}
              </button>
            ) : (
              <UserAvatar className={styles.bigAvatar} attendeeId={attendeeId} name={fullName} profile={preview} label="Vista previa de tu perfil" />
            )}
            {/* La cámara solo aparece en la pestaña Foto (en Avatar e Iniciales no estorba). */}
            {d.kind === 'photo' && !previewIsEmptyPhoto && (
              <button type="button" className={styles.cameraBtn} onClick={() => fileRef.current?.click()} disabled={busy !== null} aria-label="Cambiar foto">
                {busy === 'photo' ? <Loader2 size={16} className={styles.spin} aria-hidden="true" /> : <Camera size={16} aria-hidden="true" />}
              </button>
            )}
          </div>
          <strong className={styles.name}>{fullName}</strong>
          <span className={styles.hint}>Así te verán los demás asistentes y el equipo</span>
        </section>

        <div className={styles.controls}>
          <div className={styles.segment} role="radiogroup" aria-label="Cómo quieres verte">
            {TABS.map((t) => (
              <button
                key={t.kind}
                type="button"
                role="radio"
                aria-checked={d.kind === t.kind}
                className={`${styles.segmentItem} ${d.kind === t.kind ? styles.segmentActive : ''}`}
                onClick={() => update({ kind: t.kind })}
              >
                <span>{t.label}</span>
                {status(t.kind) && <small className={`${styles.badge} ${saved?.kind === t.kind ? styles.badgeOn : ''}`}>{status(t.kind)}</small>}
              </button>
            ))}
          </div>

          {inactiveNote && (
            <p className={styles.note} role="status">
              {KIND_NAME[d.kind][0]!.toUpperCase() + KIND_NAME[d.kind].slice(1)} {KIND_STATE[d.kind]}: hoy usas {KIND_NAME[saved!.kind]}. Pulsa «Guardar cambios» para activarla.
            </p>
          )}

          <section className={styles.panel}>
            {d.kind === 'photo' && (
              <div className={styles.photoPanel}>
                <p>Elige una foto tuya. Se recorta en cuadrado y solo la ven asistentes y el equipo del congreso.</p>
                <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
                  {busy === 'photo' ? <Loader2 size={16} className={styles.spin} aria-hidden="true" /> : <Camera size={16} aria-hidden="true" />}
                  {busy === 'photo' ? 'Preparando foto…' : d.photo || hasSavedPhoto ? 'Cambiar foto' : 'Elegir foto'}
                </Button>
                {d.photo && (
                  <button type="button" className={styles.linkBtn} onClick={() => update({ photo: null })}>
                    Descartar la foto nueva
                  </button>
                )}
                {!d.photo && hasSavedPhoto && !confirmRemove && (
                  <button type="button" className={`${styles.linkBtn} ${styles.danger}`} onClick={() => setConfirmRemove(true)} disabled={busy !== null}>
                    <Trash2 size={14} aria-hidden="true" /> Eliminar mi foto guardada
                  </button>
                )}
                {confirmRemove && (
                  <div className={styles.confirm} role="alertdialog" aria-label="Confirmar eliminación">
                    <p>¿Eliminar tu foto? Se borra del servidor y no se puede recuperar. Tu avatar e iniciales no cambian.</p>
                    <div className={styles.confirmBtns}>
                      <Button variant="outline" onClick={() => setConfirmRemove(false)} disabled={busy !== null}>
                        Cancelar
                      </Button>
                      <Button onClick={() => void removePhoto()} disabled={busy !== null}>
                        {busy === 'remove' ? 'Eliminando…' : 'Sí, eliminar'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {d.kind === 'avatar' && (
              <div className={styles.cards}>
                <div className={styles.modes} role="radiogroup" aria-label="Cómo armar tu avatar">
                  {AV_MODES.map((m) => (
                    <button
                      key={m.mode}
                      type="button"
                      role="radio"
                      aria-checked={avMode === m.mode}
                      className={`${styles.mode} ${avMode === m.mode ? styles.modeOn : ''}`}
                      onClick={m.mode === 'default' ? chooseDefault : m.mode === 'random' ? shuffle : chooseCustom}
                    >
                      {m.mode === 'random' && <Shuffle size={15} aria-hidden="true" />} {m.label}
                    </button>
                  ))}
                </div>
                {avMode === 'default' && <p className={styles.modeHelp}>El avatar de siempre, generado con tu nombre. Sin ajustes.</p>}
                {avMode === 'random' && <p className={styles.modeHelp}>Pulsa «Sorpréndeme» otra vez para ver otro. Si uno te gusta, ajústalo en Custom.</p>}

                {avMode === 'custom' && (
                  <>
                <Section id="forma" title="Forma" summary={miniBlob(cur.shape, cur.face)} open={open === 'forma'} onToggle={toggle}>
                  <div className={styles.options} role="radiogroup" aria-label="Forma">
                    {SHAPES.map((n, i) => {
                      const on = custom !== null && Math.min(Math.floor(cur.shape / 10), 9) === n;
                      return (
                        <button key={n} type="button" role="radio" aria-checked={on} aria-label={`Forma ${i + 1}`} className={`${styles.tile} ${on ? styles.tileOn : ''}`} onClick={() => setCustom({ shape: shapeCenter(n) })}>
                          <BloBatar name={customAvatarSeed(cur.face)} hue={cur.hue} shape={shapeCenter(n) / 100} tone={cur.tone / 100} size={60} />
                        </button>
                      );
                    })}
                  </div>
                </Section>

                <Section id="ojos" title="Ojos" summary={miniBlob(cur.shape, cur.face)} open={open === 'ojos'} onToggle={toggle}>
                  <div className={styles.options} role="radiogroup" aria-label="Ojos">
                    {FACES.map((f, i) => {
                      const on = custom !== null && cur.face === f;
                      return (
                        <button key={f} type="button" role="radio" aria-checked={on} aria-label={`Ojos ${i + 1}`} className={`${styles.tile} ${on ? styles.tileOn : ''}`} onClick={() => setCustom({ face: f })}>
                          <BloBatar name={customAvatarSeed(f)} hue={cur.hue} shape={cur.shape / 100} tone={cur.tone / 100} size={60} />
                        </button>
                      );
                    })}
                  </div>
                </Section>

                <Section
                  id="color"
                  title="Color"
                  summary={
                    <>
                      <span className={styles.dot} style={{ background: bodyColor(cur.hue, cur.tone) }} aria-hidden="true" />
                      <span>{TONES[curRow]!.label}</span>
                    </>
                  }
                  open={open === 'color'}
                  onToggle={toggle}
                >
                  <div className={styles.swatches} role="group" aria-label="Colores rápidos">
                    {COLORS.map((h) => {
                      const on = custom !== null && cur.hue === h;
                      return (
                        <button key={h} type="button" aria-label={`Color ${h}`} aria-pressed={on} className={`${styles.swatch} ${on ? styles.swatchOn : ''}`} style={{ background: bodyColor(h, cur.tone) }} onClick={() => setCustom({ hue: h })} />
                      );
                    })}
                  </div>
                  <p className={styles.boxHelp}>O mueve el punto: de lado a lado cambia el color; de arriba a abajo, el matiz (<strong>{TONES[curRow]!.label}</strong>).</p>
                  <ColorBox
                    label="Color y matiz del avatar"
                    hue={cur.hue}
                    row={curRow}
                    rows={TONES.length}
                    rowLabel={TONES[curRow]!.label}
                    bg={(h, r) => bodyColor(h, TONES[r]!.v)}
                    onChange={(h, r) => setCustom({ hue: h, tone: TONES[r]!.v })}
                  />
                  <div className={styles.boxEnds} aria-hidden="true">
                    <span>{TONES[0]!.label}</span>
                    <span>{TONES[TONES.length - 1]!.label}</span>
                  </div>
                </Section>
                  </>
                )}
              </div>
            )}

            {d.kind === 'initials' && (
              <div className={styles.cards}>
                <Section id="palabras" title="Palabras de tu nombre" summary={<strong className={styles.initialsPill}>{initialsText}</strong>} open={open === 'palabras'} onToggle={toggle}>
                  <p className={styles.initialsNote}>
                    Toca hasta {INITIALS_MAX_PARTS} palabras. Tus iniciales: <strong>{initialsText}</strong>. Si tu nombre cambia, se actualizan solas.
                  </p>
                  <div className={styles.chips} role="group" aria-label="Palabras de tu nombre">
                    {words.map((w, i) => {
                      const on = parts.includes(i);
                      const blocked = !on && parts.length >= INITIALS_MAX_PARTS;
                      return (
                        <button key={`${w}-${i}`} type="button" aria-pressed={on} disabled={blocked} className={`${styles.chip} ${on ? styles.chipOn : ''}`} onClick={() => togglePart(i)}>
                          <span className={styles.chipLetter}>{[...w][0]?.toUpperCase()}</span> {w}
                        </button>
                      );
                    })}
                  </div>
                </Section>

                <Section
                  id="fondo"
                  title="Color de fondo"
                  summary={<span className={styles.dot} style={{ background: hueSel === null ? 'var(--morado)' : initialsBackground(hueSel) }} aria-hidden="true" />}
                  open={open === 'fondo'}
                  onToggle={toggle}
                >
                  <div className={styles.swatches} role="group" aria-label="Colores rápidos">
                    <button type="button" aria-label="Morado Arraigados" aria-pressed={hueSel === null} className={`${styles.swatch} ${hueSel === null ? styles.swatchOn : ''}`} style={{ background: 'var(--morado)' }} onClick={() => setInitials(parts, null)} />
                    {COLORS.map((h) => (
                      <button key={h} type="button" aria-label={`Color ${h}`} aria-pressed={hueSel === h} className={`${styles.swatch} ${hueSel === h ? styles.swatchOn : ''}`} style={{ background: initialsBackground(h) }} onClick={() => setInitials(parts, h)} />
                    ))}
                  </div>
                  <p className={styles.boxHelp}>O arrastra el punto sobre la barra de colores: de izquierda a derecha recorre todos los tonos.</p>
                  <ColorBox label="Color de fondo de las iniciales" hue={hueSel ?? 250} row={0} rows={1} height={64} bg={(h) => `hsl(${h}, 58%, 40%)`} onChange={(h) => setInitials(parts, h)} />
                </Section>

                {d.initialsId && (
                  <button type="button" className={styles.linkBtn} onClick={() => update({ kind: 'initials', initialsId: '' })}>
                    Volver a las iniciales de siempre
                  </button>
                )}
              </div>
            )}
          </section>

          {msg && (
            <p className={msg.ok ? styles.ok : styles.error} role={msg.ok ? 'status' : 'alert'}>
              {msg.text}
            </p>
          )}

          <div className={styles.actions}>
            <Button block onClick={() => void save()} disabled={!canSave}>
              {busy === 'save' ? 'Guardando…' : 'Guardar cambios'}
            </Button>
            {dirty && !busy && (
              <Button block variant="outlineLight" onClick={() => { setDraft(null); setAvModeOv(null); setMsg(null); setConfirmRemove(false); }}>
                Descartar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
