import { useEffect, useMemo, useState } from 'react';
import { Bell, Check, ChevronRight, Clock, CupSoda, MapPin, Radio } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Badge from '../../components/Badge';
import EventCard from '../../components/EventCard';
import LocationButton from '../../components/LocationButton';
import DrinkCups from '../../components/DrinkCups';
import eventCardStyles from '../../components/EventCard.module.css';
import beneficiosStyles from '../Beneficios.module.css';
import { DRINK_LABEL, formatPrice, packageContent, upcomingEvents } from '../../data/app';
import { SATURDAY_PROGRAM, SATURDAY_VENUE, SUNDAY_PROGRAM, SUNDAY_VENUE_BY_ZONE, resolveZoneForDisplay, type ProgramItem } from '../../data/program';
import { firstName, usePulseSession } from '../../context/PulseSession';
import NoteTray from '../../components/notes/NoteTray';
import NoteSheet from '../../components/notes/NoteSheet';
import { useMyNotes } from '../../components/notes/useMyNotes';
import { useNotesFeed } from '../../components/notes/useNotesFeed';
import MenuCarousel from './MenuCarousel';
import MerchCarousel from './MerchCarousel';
import styles from './Home.module.css';

/**
 * "Próximos eventos" se oculta temporalmente (3 oct 2026) -- se deja el
 * bloque completo en el JSX, solo sin renderizarse, para poder reactivarlo
 * cambiando este valor a `true`. No se borra nada de data/app.ts.
 */
const SHOW_UPCOMING_EVENTS = false;

/**
 * /home -- pantalla de inicio del asistente (desde el 5 oct 2026; antes era
 * experimental y vivía junto a /inicio, que ahora redirige aquí).
 *
 * Esta edición (2 oct 2026) modifica ÚNICAMENTE la sección "Ahora": en vez
 * del evento fijo de ejemplo (`nowEvent` de data/app.ts), calcula en vivo --
 * a partir de la fecha/hora real y el programa oficial (src/data/program.ts,
 * ya existente, reutilizado tal cual en lugar de duplicar los horarios) --
 * si el Congreso todavía no empieza (cuenta regresiva), si hay una actividad
 * en curso ("En vivo", usando el mismo <EventCard variant="now">), o si
 * estamos entre actividades o después de que todo terminó.
 *
 * El resto de la pantalla (header, "Próximos eventos") sigue igual a la
 * versión anterior, que a su vez es una copia de /inicio.
 */

/* ------------------------------------------------------------------ */
/* Programa en vivo: construido a partir de SATURDAY_PROGRAM/SUNDAY_PROGRAM */
/* ------------------------------------------------------------------ */

/**
 * Tijuana / Baja California sigue el horario de verano de EE. UU. desde 2010;
 * a mediados de octubre de 2026 eso es PDT = UTC-7. Se fija aquí en vez de
 * usar una librería de zonas horarias nueva (no hace falta una dependencia
 * más para dos fechas conocidas de antemano).
 */
const TZ_OFFSET = '-07:00';
const SATURDAY_DATE = '2026-10-17';
const SUNDAY_DATE = '2026-10-18';

type LiveBlock = { start: Date; end: Date; hasExplicitEnd: boolean; kind: string; title: string };

/** "2:00 pm" -> {h: 14, m: 0} */
function parseTime12h(label: string): { h: number; m: number } {
  const match = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(label.trim());
  if (!match) return { h: 0, m: 0 };
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const meridiem = match[3].toLowerCase();
  if (meridiem === 'pm' && h !== 12) h += 12;
  if (meridiem === 'am' && h === 12) h = 0;
  return { h, m };
}

function dateAt(dateStr: string, timeLabel: string): Date {
  const { h, m } = parseTime12h(timeLabel);
  return new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00${TZ_OFFSET}`);
}

function endOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59${TZ_OFFSET}`);
}

/**
 * El texto de cada evento ("Plenaria 1 — Raíces profundas") se separa en el
 * TIPO que va en la etiqueta ("Plenaria") y el nombre específico que va en
 * el título ("Raíces profundas"). Dos casos no siguen el patrón "Tipo N —
 * Nombre" y se nombran aquí explícitamente, tal como pidió el propietario:
 * "Break / Venta por parte del Distrito" se anuncia como "Receso", e "Inicio
 * Culto" se anuncia como "Culto".
 */
const KIND_TITLE_OVERRIDES: Record<string, { kind: string; title: string }> = {
  'Break / Venta por parte del Distrito': { kind: 'Receso', title: 'Break / Venta por parte del Distrito' },
  'Inicio Culto': { kind: 'Culto', title: 'Inicio Culto' },
};

function splitKindTitle(event: string): { kind: string; title: string } {
  if (KIND_TITLE_OVERRIDES[event]) return KIND_TITLE_OVERRIDES[event];
  const parts = event.split(' — ');
  if (parts.length === 2) {
    return { kind: parts[0].replace(/\s*\d+$/, '').trim(), title: parts[1].trim() };
  }
  return { kind: event, title: event };
}

/**
 * Construye los bloques de un día: el fin de cada actividad es el inicio de
 * la siguiente (regla explícita del propietario -- nunca una duración
 * inventada). La ÚLTIMA actividad del día ("Convivencia" el sábado,
 * "Despedida" el domingo) no tiene una siguiente actividad ese mismo día, así
 * que su fin se fija al final del día calendario: evita inventar una
 * duración y evita que, de madrugada, la tarjeta siga diciendo "En vivo".
 */
function buildDayBlocks(dateStr: string, items: readonly ProgramItem[]): LiveBlock[] {
  return items.map((item, i) => {
    const start = dateAt(dateStr, item.time);
    const hasExplicitEnd = i < items.length - 1;
    const end = hasExplicitEnd ? dateAt(dateStr, items[i + 1].time) : endOfDay(dateStr);
    const { kind, title } = splitKindTitle(item.event);
    return { start, end, hasExplicitEnd, kind, title };
  });
}

function findActiveBlock(blocks: LiveBlock[], now: Date): LiveBlock | null {
  return blocks.find((b) => now >= b.start && now < b.end) ?? null;
}

function formatClock(d: Date): string {
  return d
    .toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Tijuana' })
    .toUpperCase()
    .replace('P. M.', 'PM')
    .replace('A. M.', 'AM')
    .replace('P.M.', 'PM')
    .replace('A.M.', 'AM');
}

function formatLongDate(d: Date): string {
  const s = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Tijuana' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Versión corta de la fecha ("17 oct") para la columna de fecha en
 * pantallas angostas -- mismo cálculo de fecha, solo cambia el formato de
 * texto que se muestra. */
function formatShortDate(d: Date): string {
  const s = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'America/Tijuana' });
  return s.replace(/\./g, '');
}

/** Cuenta regresiva en días/horas/minutos/segundos hacia `target`. Nunca negativa. */
function useCountdown(target: Date, now: Date) {
  const diffMs = Math.max(target.getTime() - now.getTime(), 0);
  const totalSeconds = Math.floor(diffMs / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function CountdownGrid({ target, now }: { target: Date; now: Date }) {
  const { days, hours, minutes, seconds } = useCountdown(target, now);
  const pad = (n: number) => String(n).padStart(2, '0');
  const units = [
    { value: pad(days), label: days === 1 ? 'DÍA' : 'DÍAS' },
    { value: pad(hours), label: 'HRS' },
    { value: pad(minutes), label: 'MIN' },
    { value: pad(seconds), label: 'SEG' },
  ];
  return (
    <div className={styles.countdown} role="timer" aria-label="Cuenta regresiva para el inicio del Congreso">
      {units.map((u) => (
        <div key={u.label} className={styles.countdownUnit}>
          <span className={styles.countdownValue}>{u.value}</span>
          <span className={styles.countdownLabel}>{u.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { me, state: pulse } = usePulseSession();
  const fullName = me?.attendee.fullName ?? '';
  const [open, setOpen] = useState(false);
  // Nota del asistente (burbuja sobre el avatar). Un fallo aquí nunca rompe /home.
  const notes = useMyNotes(pulse.phase === 'ready' ? pulse.token : '');
  const feed = useNotesFeed(pulse.phase === 'ready' ? pulse.token : '');
  const [noteOpen, setNoteOpen] = useState(false);
  const [unread, setUnread] = useState(true);
  const now = useNow();

  const zone = resolveZoneForDisplay(me?.attendee.zoneName);
  const sundayVenue = SUNDAY_VENUE_BY_ZONE[zone];

  const saturdayBlocks = useMemo(() => buildDayBlocks(SATURDAY_DATE, SATURDAY_PROGRAM), []);
  const sundayBlocks = useMemo(() => buildDayBlocks(SUNDAY_DATE, SUNDAY_PROGRAM), []);
  const congressStart = saturdayBlocks[0].start;
  const congressEnd = sundayBlocks[sundayBlocks.length - 1].end;

  const toggleBell = () => {
    const next = !open;
    setOpen(next);
    if (next) setUnread(false);
  };

  /** "Ahora": antes del Congreso | en vivo | entre actividades | terminado. */
  const nowCard = (() => {
    if (now < congressStart) {
      return { phase: 'before' as const };
    }
    if (now >= congressEnd) {
      return { phase: 'finished' as const };
    }
    const activeSat = findActiveBlock(saturdayBlocks, now);
    if (activeSat) return { phase: 'live' as const, block: activeSat, venue: SATURDAY_VENUE };
    const activeSun = findActiveBlock(sundayBlocks, now);
    if (activeSun) return { phase: 'live' as const, block: activeSun, venue: sundayVenue };

    // Entre bloques (p. ej. domingo de día, antes de la segunda jornada):
    // la próxima actividad conocida es la primera del domingo.
    const next = sundayBlocks[0];
    return { phase: 'between' as const, block: next, venue: sundayVenue };
  })();

  if (!me) return null; // RequireAttendee garantiza la sesión; esto solo satisface a TS.

  return (
    <div className={`page-enter ${styles.page}`}>
      <header className={styles.top}>
        <div className={styles.identityText}>
          <span className={styles.hello}>Hola, {firstName(fullName)}</span>
          <Badge variant="tag">{me?.package.name ?? ''}</Badge>
        </div>
        <button type="button" className={styles.bell} aria-label="Notificaciones" aria-expanded={open} onClick={toggleBell}>
          <Bell size={20} strokeWidth={2.1} />
          {unread && <span className={styles.bellDot} aria-hidden="true" />}
        </button>

        {open && (
          <div className={styles.panel} role="dialog" aria-label="Notificaciones">
            <p className={styles.panelHead}>Notificaciones</p>
            <ul className={styles.panelList}>
              {[
                { id: 1, title: 'La plenaria está en vivo', detail: 'Auditorio Principal · hasta las 21:30', live: true },
                { id: 2, title: 'Comida lista', detail: 'Recepción Norte · 14:00 - 15:30', live: false },
                { id: 3, title: 'Tu kit está disponible', detail: 'Recógelo en el punto de credenciales', live: false },
              ].map((n) => (
                <li key={n.id} className={styles.panelItem}>
                  <span className={styles.panelIcon} aria-hidden="true">
                    <Radio size={15} strokeWidth={2.2} />
                  </span>
                  <span className={styles.panelBody}>
                    <strong>{n.title}</strong>
                    <span>{n.detail}</span>
                  </span>
                  {n.live && <span className={styles.panelLive}>EN VIVO</span>}
                </li>
              ))}
            </ul>
            <button type="button" className={styles.panelClose} onClick={() => setOpen(false)}>
              Cerrar
            </button>
          </div>
        )}
      </header>

      <NoteTray
        me={{ attendeeId: me.attendee.id, name: fullName }}
        ownStatus={notes.status}
        ownNote={notes.active}
        onOpenOwn={() => setNoteOpen(true)}
        feedStatus={feed.status}
        feed={feed.items}
        onLike={feed.like}
      />

      <section className={`${styles.section} ${styles.current}`}>
        <h2 className="label">Ahora</h2>

        {nowCard.phase === 'live' && (
          <EventCard
            variant="now"
            kind={nowCard.block.kind.toUpperCase()}
            title={nowCard.block.title}
            venue={nowCard.venue}
            time={nowCard.block.hasExplicitEnd ? `${formatClock(nowCard.block.start)} – ${formatClock(nowCard.block.end)}` : formatClock(nowCard.block.start)}
            live
          />
        )}

        {nowCard.phase === 'before' && (
          <div className={eventCardStyles.now}>
            {/* "PRÓXIMAMENTE" + "FALTAN" se agrupan en una sola columna
                (misma posición horizontal de siempre) y el logo CONG2K26 se
                centra verticalmente contra ese bloque completo de 2 líneas,
                no solo contra "FALTAN" (3 oct 2026). Se reutiliza el arte ya
                existente del congreso (el mismo que usa Cover.tsx), no se
                crea ni sustituye por texto. */}
            <div className={styles.countdownHeader}>
              <div className={styles.countdownHeaderText}>
                <div className={eventCardStyles.nowTop}>
                  <span className={eventCardStyles.nowKind}>PRÓXIMAMENTE</span>
                </div>
                <h3 className={eventCardStyles.nowTitle}>FALTAN</h3>
              </div>
              {/* El archivo real (CONG2026k_Bage.svg) trae un lienzo cuadrado
                  2048x2048 con el logotipo dibujado solo en una franja
                  angosta al centro (mucho margen transparente alrededor);
                  mostrarlo tal cual a tamaño chico lo vuelve casi invisible.
                  .countdownLogo recorta ese margen por CSS (el mismo archivo
                  que usa Cover.tsx, sin crear una versión nueva del logo). */}
              <span className={styles.countdownLogo}>
                <img
                  className={styles.countdownLogoImg}
                  src="/rcs/svg_editables/CONG2026k_Bage.svg"
                  alt="Congreso 2K26"
                  width="2048"
                  height="2048"
                  draggable={false}
                />
              </span>
            </div>
            <CountdownGrid target={congressStart} now={now} />
            <div className={styles.inlineInfo}>
              <ul className={eventCardStyles.nowMeta}>
                <li>
                  <Clock size={15} strokeWidth={2.2} />
                  <span className={styles.dateLong}>
                    {formatLongDate(congressStart)} · {formatClock(congressStart)}
                  </span>
                  <span className={styles.dateShort}>
                    {formatShortDate(congressStart)} · {formatClock(congressStart)}
                  </span>
                </li>
                <li>
                  <MapPin size={15} strokeWidth={2.2} />
                  {SATURDAY_VENUE}
                </li>
              </ul>
              <span className={styles.locationFix}>
                <LocationButton venue={SATURDAY_VENUE} />
              </span>
            </div>
          </div>
        )}

        {nowCard.phase === 'between' && (
          <div className={eventCardStyles.now}>
            <div className={eventCardStyles.nowTop}>
              <span className={eventCardStyles.nowKind}>PRÓXIMAMENTE</span>
            </div>
            <h3 className={eventCardStyles.nowTitle}>{nowCard.block.kind.toUpperCase()}</h3>
            <ul className={eventCardStyles.nowMeta}>
              <li>
                <Clock size={15} strokeWidth={2.2} />
                {formatLongDate(nowCard.block.start)} · {formatClock(nowCard.block.start)}
              </li>
              <li>
                <MapPin size={15} strokeWidth={2.2} />
                {nowCard.venue}
              </li>
            </ul>
            <span className={styles.locationFix}>
              <LocationButton venue={nowCard.venue} />
            </span>
          </div>
        )}

        {nowCard.phase === 'finished' && (
          <div className={eventCardStyles.now}>
            <div className={eventCardStyles.nowTop}>
              <span className={eventCardStyles.nowKind}>ARRAIGADOS 2K26</span>
            </div>
            <h3 className={eventCardStyles.nowTitle}>¡GRACIAS!</h3>
            <ul className={eventCardStyles.nowMeta}>
              <li>El Congreso ha concluido.</li>
            </ul>
          </div>
        )}
      </section>

      {/*
       * "Mi kit" (3 oct 2026) -- mismo contenido que /beneficios (Beneficios.tsx),
       * reutilizando sus estilos (Beneficios.module.css) y el componente
       * <DrinkCups> tal cual, sin tocar ninguno de los dos: ni esa pantalla ni
       * sus archivos cambian. Va después de la cuenta regresiva. El paquete,
       * precio y aguas frescas disponibles/usadas vienen de Neon (me.package,
       * me.drinksUsed, me.drinksRemaining); lo que incluye cada paquete es el
       * mismo contenido fijo de siempre (data/app.ts -> packageContent). Si el
       * paquete incluye aguas frescas, se muestran como vasos -- sólidos los
       * disponibles, punteados los ya canjeadas -- y ese conteo baja solo
       * (aguas frescas restantes) conforme el staff las va canjeando.
       */}
      <section className={`${styles.section} ${styles.current}`}>
        <h2 className="label">Mi kit</h2>
        {/* .kitPanel (3 oct 2026) solo re-colorea el fondo a vidrio esmerilado
            (glassmorphism) -- se agrega como segunda clase junto a
            beneficiosStyles.packagePanel en vez de editar Beneficios.module.css,
            así /beneficios conserva su tarjeta sólida de siempre. */}
        <div className={`${beneficiosStyles.packagePanel} ${styles.kitPanel}`}>
          <section className={beneficiosStyles.priceCard}>
            <span className={beneficiosStyles.code}>{me.package.name}</span>
            <strong className={beneficiosStyles.price}>{formatPrice(me.package.price)}</strong>
          </section>

          <section className={beneficiosStyles.section}>
            <h2 className="label">Incluye</h2>
            {(packageContent[me.package.name] ?? []).length > 0 ? (
              <ul className={beneficiosStyles.includes}>
                {(packageContent[me.package.name] ?? []).map((item) => (
                  <li key={item}>
                    <span className={beneficiosStyles.check} aria-hidden="true">
                      <Check size={13} strokeWidth={3.2} />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={beneficiosStyles.muted}>Pregunta al staff qué incluye tu kit.</p>
            )}
          </section>

          <section className={beneficiosStyles.section}>
            <h2 className="label">Aguas frescas</h2>
            {me.package.includedDrinks > 0 ? (
              <div className={`${beneficiosStyles.drinks} ${styles.drinksWrap}`}>
                <DrinkCups
                  total={me.package.includedDrinks}
                  used={me.drinksUsed}
                  size={46}
                  className={styles.drinksCupsRow}
                />
                <p className={beneficiosStyles.drinksCount}>
                  <strong>{me.drinksRemaining}</strong> de {me.package.includedDrinks} disponibles
                </p>
                <p className={beneficiosStyles.muted}>
                  <CupSoda size={14} strokeWidth={2.2} aria-hidden="true" /> Para canjear, muestra tu pulsera al staff.
                  Cada vez que te entreguen una, aquí se marca como usada.
                </p>
              </div>
            ) : (
              <p className={beneficiosStyles.muted}>Tu kit no incluye {DRINK_LABEL}.</p>
            )}
          </section>
        </div>
      </section>

      {/*
       * Carrusel "Menú" (3 oct 2026) -- platillos reales de /admin/menu
       * (GET /api/menu). Sección independiente, propia componente
       * (MenuCarousel.tsx): decide sola si mostrarse (nada si no hay
       * platillos todavía). Va después de "Mi kit", antes de "Próximos
       * eventos" -- tal como se acordó, sin agregarse al nav.
       */}
      <MenuCarousel />

      {/*
       * Vitrina "Mercancía oficial" (3 oct 2026, conectada a datos reales el
       * mismo día) -- artículos reales de /admin/merch (GET /api/merch).
       * Va después del Menú y antes de "Próximos eventos", por la misma
       * razón: sección nueva e independiente, sin tocar el resto de Home.
       */}
      <MerchCarousel />

      {SHOW_UPCOMING_EVENTS && (
        <section className={`${styles.section} ${styles.agenda}`}>
          <div className={styles.sectionHead}>
            <h2 className="label">Próximos eventos</h2>
            <button type="button" className={styles.link} onClick={() => navigate('/programa')}>
              Ver programa
              <ChevronRight size={15} strokeWidth={2.4} />
            </button>
          </div>
          <div className={styles.list}>
            {upcomingEvents.map((ev) => (
              <EventCard key={ev.id} kind={ev.kind} title={ev.title} venue={ev.venue} time={ev.time} />
            ))}
          </div>
        </section>
      )}

      {noteOpen && (
        <NoteSheet
          status={notes.status}
          error={notes.error}
          active={notes.active}
          now={notes.now}
          onPublish={notes.publish}
          onRemove={notes.remove}
          onReload={notes.reload}
          onClose={() => setNoteOpen(false)}
        />
      )}
    </div>
  );
}
