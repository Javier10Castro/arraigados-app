import { pulseCodeLabel, type PageSize } from './api';

/**
 * Auditoría (Etapa 8, 5 oct 2026) -- catálogo de acciones y formato de detalle.
 *
 * La tabla "AuditLog" ya existía y la llenan varias partes del servidor (usuarios,
 * lotes, asistentes, pulseras, canjes, ajustes y moderación de Notas). Esta pantalla
 * (/admin/auditoria, solo ADMIN, solo lectura) únicamente la LEE: este archivo traduce
 * `action` + `metadata` a texto en español. Una acción nueva que no esté aquí no se
 * rompe: aparece en la categoría "Otros" con su nombre técnico y su metadata genérica.
 *
 * Seguridad: `fp` (huella de la contraseña en user.create / user.password_reset) NO se
 * muestra nunca, ni en el detalle genérico.
 */

export type AuditCategory = 'usuarios' | 'lotes' | 'asistentes' | 'pulseras' | 'canjes' | 'notas' | 'avisos' | 'iglesias' | 'beneficios' | 'menu' | 'mercancia' | 'ajustes' | 'otros';

export const AUDIT_CATEGORIES: { id: AuditCategory; label: string }[] = [
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'lotes', label: 'Lotes' },
  { id: 'asistentes', label: 'Asistentes' },
  { id: 'pulseras', label: 'Pulseras' },
  { id: 'canjes', label: 'Canjes' },
  { id: 'notas', label: 'Notas' },
  { id: 'avisos', label: 'Avisos' },
  { id: 'iglesias', label: 'Iglesias' },
  { id: 'beneficios', label: 'Beneficios' },
  { id: 'menu', label: 'Menú' },
  { id: 'mercancia', label: 'Mercancía' },
  { id: 'ajustes', label: 'Ajustes' },
];

export const AUDIT_ACTIONS: Record<string, { label: string; category: AuditCategory }> = {
  'user.create': { label: 'Creó una cuenta', category: 'usuarios' },
  'user.update': { label: 'Editó una cuenta', category: 'usuarios' },
  'user.password_reset': { label: 'Restableció una contraseña', category: 'usuarios' },
  'user.delete': { label: 'Eliminó una cuenta', category: 'usuarios' },
  'user.password_change': { label: 'Cambió su contraseña', category: 'usuarios' },
  'batch.create': { label: 'Creó un lote', category: 'lotes' },
  'batch.delete': { label: 'Borró un lote', category: 'lotes' },
  'attendee.update': { label: 'Corrigió datos de un asistente', category: 'asistentes' },
  'pulse.reassign': { label: 'Reemplazó una pulsera', category: 'pulseras' },
  'redemption.void': { label: 'Anuló un canje', category: 'canjes' },
  'note.retire': { label: 'Retiró una nota', category: 'notas' },
  'blocked_word.add': { label: 'Bloqueó una palabra', category: 'notas' },
  'blocked_word.remove': { label: 'Desbloqueó una palabra', category: 'notas' },
  'blocked_word.update': { label: 'Corrigió una palabra bloqueada', category: 'notas' },
  'announcement.create': { label: 'Publicó un aviso', category: 'avisos' },
  'announcement.retire': { label: 'Retiró un aviso', category: 'avisos' },
  'church.create': { label: 'Agregó una iglesia', category: 'iglesias' },
  'church.update': { label: 'Editó una iglesia', category: 'iglesias' },
  'church.delete': { label: 'Eliminó una iglesia', category: 'iglesias' },
  'benefit.create': { label: 'Agregó un beneficio a un kit', category: 'beneficios' },
  'benefit.update': { label: 'Editó un beneficio', category: 'beneficios' },
  'benefit.delete': { label: 'Quitó un beneficio de un kit', category: 'beneficios' },
  'benefit.move': { label: 'Reordenó un beneficio', category: 'beneficios' },
  'dish.create': { label: 'Agregó un platillo al menú', category: 'menu' },
  'dish.update': { label: 'Editó un platillo', category: 'menu' },
  'dish.delete': { label: 'Eliminó un platillo del menú', category: 'menu' },
  'merch.create': { label: 'Agregó un artículo a mercancía', category: 'mercancia' },
  'merch.update': { label: 'Editó un artículo de mercancía', category: 'mercancia' },
  'merch.delete': { label: 'Eliminó un artículo de mercancía', category: 'mercancia' },
  'setting.update': { label: 'Cambió un ajuste', category: 'ajustes' },
};

export const auditLabel = (action: string) => AUDIT_ACTIONS[action]?.label ?? action;
export const auditCategory = (action: string): AuditCategory => AUDIT_ACTIONS[action]?.category ?? 'otros';
/** Acciones de una categoría (para filtrar en SQL). 'otros' se resuelve en el servidor con NOT IN. */
export const auditActionsOf = (category: AuditCategory) =>
  Object.entries(AUDIT_ACTIONS)
    .filter(([, v]) => v.category === category)
    .map(([k]) => k);

/* ------------------------------------------------------------------ */
/* Tipos de la API                                                     */
/* ------------------------------------------------------------------ */

export type AdminAuditFilters = {
  q?: string;
  category?: AuditCategory | '';
  actorId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: PageSize;
};

export type AdminAuditRow = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string;
  /** Nombre legible de aquello sobre lo que se actuó (persona, lote, cuenta…), si se pudo resolver. */
  entityName: string | null;
  actorId: string | null;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  /** Correo de la cuenta sobre la que se actuó (si todavía existe). Respaldo para registros viejos. */
  entityEmail?: string | null;
  /** Código de lote o de pulsera de la entidad (si todavía existe). Respaldo para registros viejos. */
  entityCode?: string | null;
  /** Pulsera anterior en un reemplazo (si todavía existe). Respaldo para registros viejos. */
  relatedCode?: string | null;
};

export type AdminAuditActor = { id: string; name: string };

/** Totales de TODA la bitácora (no dependen de los filtros). */
export type AdminAuditSummary = { total: number; last24h: number; actors: number };

export type AdminAuditResponse = {
  total: number;
  page: number;
  pageSize: number;
  rows: AdminAuditRow[];
  summary: AdminAuditSummary;
  actors: AdminAuditActor[];
  /** true solo para la cuenta autorizada a vaciar la bitácora. */
  canClear: boolean;
};

/* ------------------------------------------------------------------ */
/* Detalle legible                                                     */
/* ------------------------------------------------------------------ */

export type AuditDetail = { label: string; value: string };
export type AuditSummary = { title: string; detail: string };

type Row = Pick<AdminAuditRow, 'action' | 'entityType' | 'entityId'> &
  Partial<Pick<AdminAuditRow, 'entityName' | 'metadata' | 'entityEmail' | 'entityCode' | 'relatedCode'>>;

const text = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
/** Texto limpio o '' (nunca "undefined" ni objetos). */
const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const ROLE: Record<string, string> = { ADMIN: 'Administrador', STAFF: 'Staff' };
const AVATAR: Record<string, string> = { blobatar: 'Avatares Blobatar', initials: 'Iniciales' };
const AVAIL: Record<string, string> = { tbd: 'Por definir', onsite: 'Disponible presencialmente' };
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const quote = (s: string) => `“${s}”`;
const count = (n: unknown, one: string, many: string) => `${Number(n) || 0} ${Number(n) === 1 ? one : many}`;
const fromTo = (c: unknown, fmt: (v: unknown) => string = (v) => text(v)) => `${fmt(obj(c).from)} → ${fmt(obj(c).to)}`;
/** centavos MXN -> "$80" / "$80.50" */
const money = (cents: unknown) => {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '—';
  const pesos = n / 100;
  return `$${pesos.toLocaleString('es-MX', { minimumFractionDigits: Number.isInteger(pesos) ? 0 : 2, maximumFractionDigits: 2 })}`;
};
const stamp = (iso: unknown) => {
  const d = new Date(String(iso));
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('es-MX', { timeZone: 'America/Tijuana', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
};

const pulseCode = (c: string) => (c ? pulseCodeLabel(c) : '');

const acct = (verb: string, who: string) => (who ? `${verb} la cuenta ${who}` : `${verb} una cuenta`);
const ofKit = (m: Record<string, unknown>, prep: 'al' | 'del') => (str(m.kit) ? `${prep} ${str(m.kit)}` : prep === 'al' ? 'a un kit' : 'de un kit');

/** [etiqueta en la línea corta (o null), valor, etiqueta en el modal (por defecto «Resultado»)] */
type Part = [label: string | null, value: string, modalLabel?: string];
type Built = { title: string; parts: Part[] };

/** Cuenta: correo (de la propia bitácora; si es un registro viejo, el de la cuenta si aún existe) o nombre. */
const account = (row: Row, m: Record<string, unknown>) => str(m.email) || str(row.entityEmail) || str(m.name) || str(row.entityName);
const attendeeOf = (row: Row, m: Record<string, unknown>) =>
  str(obj(m.fullName).to) || str(m.attendee) || str(m.attendeeName) || str(row.entityName);
const churchOf = (row: Row, m: Record<string, unknown>) => str(m.church) || str(m.name) || str(obj(m.name).to) || str(row.entityName);

/**
 * Construye "titular" + partes de detalle de un evento. TODO sale del propio `metadata` (así el registro
 * sigue siendo legible aunque la cuenta, el lote o la persona ya no existan); el nombre/código/correo que trae
 * el servidor por JOIN solo respalda a los registros viejos que no guardaron ese dato.
 */
function build(row: Row): Built {
  const m = obj(row.metadata);
  switch (row.action) {
    /* ---- Cuentas ---- */
    case 'user.create':
      return {
        title: acct('Creó', account(row, m)),
        parts: [['Rol', ROLE[String(m.role)] ?? text(m.role)], ...(m.temporary ? ([[null, 'Contraseña temporal asignada', 'Contraseña']] as Part[]) : [])],
      };
    case 'user.update': {
      const b = obj(m.before);
      const a = obj(m.after);
      const who = account(row, m);
      const keys = Object.keys(a);
      const parts: Part[] = [];
      if ('name' in a) parts.push(['Nombre', `${text(b.name)} → ${text(a.name)}`]);
      if ('role' in a) parts.push(['Rol', `${ROLE[String(b.role)] ?? text(b.role)} → ${ROLE[String(a.role)] ?? text(a.role)}`]);
      if ('active' in a) parts.push(['Estado', `${b.active ? 'Activa' : 'Desactivada'} → ${a.active ? 'Activa' : 'Desactivada'}`]);
      if (keys.length === 1 && keys[0] === 'active') return { title: acct(a.active ? 'Reactivó' : 'Desactivó', who), parts: [] };
      if (keys.length === 1 && keys[0] === 'name') return { title: who ? `Cambió el nombre de la cuenta ${who}` : 'Cambió el nombre de una cuenta', parts: [[null, `${text(b.name)} → ${text(a.name)}`, 'Nombre']] };
      return { title: acct('Editó', who), parts };
    }
    case 'user.password_reset':
      return { title: account(row, m) ? `Restableció la contraseña de ${account(row, m)}` : 'Restableció una contraseña', parts: [[null, 'Nueva contraseña temporal asignada', 'Contraseña']] };
    case 'user.password_change':
      return { title: 'Cambió su contraseña', parts: [] };
    case 'user.delete': {
      const name = str(m.name);
      const email = str(m.email);
      return {
        title: name && email ? `Eliminó la cuenta de ${name} (${email})` : acct('Eliminó', email || name),
        parts: [['Rol', ROLE[String(m.role)] ?? text(m.role)]],
      };
    }

    /* ---- Lotes ---- */
    case 'batch.create':
      return { title: `Creó el lote ${str(m.code) || str(row.entityCode) || str(row.entityName) || ''}`.trim(), parts: [[null, count(m.quantity, 'pulsera', 'pulseras'), 'Pulseras']] };
    case 'batch.delete': {
      const bits = [count(m.pulses, 'pulsera', 'pulseras')];
      if (Number(m.attendees) > 0) bits.push(count(m.attendees, 'asistente', 'asistentes'));
      if (Number(m.redemptions) > 0) bits.push(count(m.redemptions, 'canje', 'canjes'));
      if (Number(m.notes) > 0) bits.push(count(m.notes, 'nota', 'notas'));
      return { title: `Eliminó el lote ${str(m.code) || str(row.entityName) || ''}`.trim(), parts: bits.map((b) => [null, b, 'Se borró'] as Part) };
    }

    /* ---- Asistentes ---- */
    case 'attendee.update': {
      const who = attendeeOf(row, m);
      const parts: Part[] = [];
      if (m.fullName) parts.push(['Nombre', fromTo(m.fullName)]);
      if (m.ageRange) parts.push(['Edad', fromTo(m.ageRange)]);
      if (m.church) parts.push(['Iglesia', fromTo(m.church)]);
      if (m.presbytery) parts.push(['Presbiterio', fromTo(m.presbytery)]);
      if (m.zone) parts.push(['Zona', fromTo(m.zone)]);
      if (m.package) parts.push(['Paquete', fromTo(m.package)]);
      const known = new Set(['fullName', 'ageRange', 'church', 'presbytery', 'zone', 'package', 'attendee']);
      for (const [k, v] of Object.entries(m)) if (!known.has(k) && typeof v === 'object') parts.push([k, fromTo(v)]);
      if (parts.length === 1) {
        const [label, value] = parts[0];
        const single: Record<string, string> = {
          Nombre: 'Cambió el nombre del asistente',
          Edad: `Cambió la edad de ${who}`,
          Iglesia: `Cambió la iglesia de ${who}`,
          Presbiterio: `Cambió el presbiterio de ${who}`,
          Zona: `Cambió la zona de ${who}`,
          Paquete: `Cambió el paquete de ${who}`,
        };
        if (label && single[label]) return { title: single[label], parts: [[null, value, label]] };
      }
      return { title: `Corrigió los datos de ${who || 'un asistente'}`, parts };
    }

    /* ---- Pulseras ---- */
    case 'pulse.reassign': {
      const who = str(m.attendeeName) || str(row.entityName);
      const oldCode = pulseCode(str(m.oldCode) || str(row.relatedCode));
      const newCode = pulseCode(str(m.newCode) || str(row.entityCode));
      const water = Number(m.drinksUsed) > 0 ? `${count(m.drinksUsed, 'agua conservada', 'aguas conservadas')}` : 'sin aguas canjeadas';
      const codes = oldCode && newCode ? `${oldCode} → ${newCode}` : '';
      if (who) return { title: `Reemplazó la pulsera de ${who}`, parts: [...(codes ? ([[null, codes, 'Pulseras']] as Part[]) : []), [null, water, 'Aguas'], [null, 'pulsera anterior invalidada', 'Pulsera anterior']] };
      if (oldCode && newCode) return { title: `Reemplazó la pulsera ${oldCode} por ${newCode}`, parts: [[null, water, 'Aguas'], [null, 'pulsera anterior invalidada', 'Pulsera anterior']] };
      return { title: 'Reemplazó una pulsera', parts: [[null, water, 'Aguas'], [null, 'pulsera anterior invalidada', 'Pulsera anterior']] };
    }

    /* ---- Canjes ---- */
    case 'redemption.void': {
      const who = str(m.attendeeName) || str(row.entityName);
      const what = m.restored ? count(m.quantity, 'agua devuelta', 'aguas devueltas') : 'beneficio no devuelto';
      return { title: who ? `Anuló el canje de ${who}` : 'Anuló un canje', parts: [['Motivo', text(m.reason)], [null, what, 'Beneficio']] };
    }

    /* ---- Notas ---- */
    case 'note.retire': {
      const who = str(m.attendeeName) || str(row.entityName);
      return {
        title: who ? `Retiró la nota de ${who}` : 'Retiró una nota',
        parts: [['Motivo', text(m.reason)], ...(str(m.text) ? ([[null, quote(str(m.text)), 'Texto de la nota']] as Part[]) : [])],
      };
    }
    case 'blocked_word.add':
      return { title: `Bloqueó la palabra ${quote(str(m.word) || str(row.entityId))}`, parts: [] };
    case 'blocked_word.remove':
      return { title: `Desbloqueó la palabra ${quote(str(m.word) || str(row.entityId))}`, parts: [] };
    case 'blocked_word.update':
      return { title: 'Corrigió la palabra bloqueada', parts: [[null, `${quote(text(m.from))} → ${quote(text(m.to))}`, 'Cambió']] };

    /* ---- Avisos ---- */
    case 'announcement.create': {
      const aud = m.audience === 'ALL' ? 'Todos' : text(m.audience);
      return m.scheduled
        ? { title: `Programó el aviso ${quote(text(m.title))}`, parts: [['Destinatarios', aud], [null, `Programado para ${stamp(m.publishAt)}`]] }
        : { title: `Publicó el aviso ${quote(text(m.title))}`, parts: [['Destinatarios', aud]] };
    }
    case 'announcement.retire':
      return { title: `Retiró el aviso ${quote(text(m.title))}`, parts: [] };

    /* ---- Iglesias ---- */
    case 'church.create':
      return { title: `Agregó la iglesia ${text(m.name)}`, parts: [['Presbiterio', text(m.presbytery)], ['Zona', text(m.zone)]] };
    case 'church.update': {
      const who = churchOf(row, m);
      const parts: Part[] = [];
      if (m.name) parts.push(['Nombre', fromTo(m.name)]);
      if (m.presbytery) parts.push(['Presbiterio', fromTo(m.presbytery)]);
      if (m.zone) parts.push(['Zona', fromTo(m.zone)]);
      if (parts.length === 1 && parts[0][0] === 'Nombre') return { title: 'Cambió el nombre de la iglesia', parts: [[null, parts[0][1], 'Nombre']] };
      return { title: `Editó la iglesia ${who || ''}`.trim(), parts };
    }
    case 'church.delete':
      return { title: `Eliminó la iglesia ${text(m.name)}`, parts: [['Presbiterio', text(m.presbytery)], ...(str(m.zone) ? ([['Zona', str(m.zone)]] as Part[]) : [])] };

    /* ---- Beneficios (siempre con el kit) ---- */
    case 'benefit.create':
      return { title: `Agregó el beneficio ${quote(text(m.label))} ${ofKit(m, 'al')}`, parts: [] };
    case 'benefit.update':
      return { title: `Editó el beneficio ${quote(str(obj(m.label).to) || text(m.label))} ${ofKit(m, 'del')}`, parts: [['Nombre', fromTo(m.label)]] };
    case 'benefit.move':
      return { title: `Reordenó los beneficios ${ofKit(m, 'del')}`, parts: [[null, `${quote(text(m.label))} ${m.dir === 'arriba' ? 'subió' : 'bajó'} una posición`, 'Movimiento']] };
    case 'benefit.delete':
      return { title: `Quitó el beneficio ${quote(text(m.label))} ${ofKit(m, 'del')}`, parts: [] };

    /* ---- Menú ---- */
    case 'dish.create':
      return { title: `Agregó el platillo ${quote(text(m.name))} al menú`, parts: [...(m.price != null ? ([[null, money(m.price), 'Precio']] as Part[]) : []), ...(str(m.venue) ? ([['Sede', str(m.venue)]] as Part[]) : [])] };
    case 'dish.update': {
      const parts: Part[] = [];
      if (m.name) parts.push(['Nombre', fromTo(m.name)]);
      if (m.price) parts.push(['Precio', fromTo(m.price, money)]);
      if (m.available) parts.push(['Disponibilidad', fromTo(m.available, (v) => (v ? 'Disponible' : 'Agotado'))]);
      if (m.venue) parts.push(['Sede', fromTo(m.venue)]);
      if (m.description) parts.push([null, 'Descripción actualizada', 'Descripción']);
      if (m.image) parts.push([null, 'Foto actualizada', 'Foto']);
      return { title: `Editó el platillo ${quote(str(m.dish) || text(obj(m.name).to))}`, parts };
    }
    case 'dish.delete':
      return { title: `Eliminó el platillo ${quote(text(m.name))} del menú`, parts: [...(m.price != null ? ([[null, money(m.price), 'Precio']] as Part[]) : []), ...(str(m.venue) ? ([['Sede', str(m.venue)]] as Part[]) : [])] };

    /* ---- Mercancía ---- */
    case 'merch.create':
      return { title: `Agregó el artículo ${quote(text(m.name))} a mercancía`, parts: [[null, m.price != null ? money(m.price) : 'Precio por definir', 'Precio']] };
    case 'merch.update': {
      const parts: Part[] = [];
      if (m.name) parts.push(['Nombre', fromTo(m.name)]);
      if (m.price) parts.push(['Precio', fromTo(m.price, (v) => (v == null ? 'Por definir' : money(v)))]);
      if (m.availability) parts.push(['Disponibilidad', fromTo(m.availability, (v) => AVAIL[String(v)] ?? text(v))]);
      if (m.description) parts.push([null, 'Descripción actualizada', 'Descripción']);
      if (m.images) parts.push([null, 'Fotos actualizadas', 'Fotos']);
      return { title: `Editó el artículo ${quote(str(m.item) || text(obj(m.name).to))}`, parts };
    }
    case 'merch.delete':
      return { title: `Eliminó el artículo ${quote(text(m.name))} de mercancía`, parts: [[null, m.price != null ? money(m.price) : 'Precio por definir', 'Precio']] };

    /* ---- Ajustes ---- */
    case 'setting.update': {
      const label = row.entityId === 'avatarMode' ? 'el tipo de avatar' : `el ajuste ${text(row.entityId)}`;
      const v = (x: unknown) => AVATAR[String(x)] ?? text(x);
      return { title: `Cambió ${label}`, parts: [[null, `${v(m.previous)} → ${v(m.value)}`, 'Cambio']] };
    }

    default:
      // Acción que este catálogo todavía no conoce: se muestra tal cual, sin la huella `fp`.
      return {
        title: auditLabel(row.action),
        parts: Object.entries(m)
          .filter(([k]) => k !== 'fp')
          .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : text(v)] as Part),
      };
  }
}

/** Frase corta para leer la bitácora de un vistazo: titular + detalle en una línea. */
export function auditSummary(row: Row): AuditSummary {
  const b = build(row);
  return { title: b.title, detail: b.parts.filter(([, v]) => v !== '—').map(([l, v]) => (l ? `${l}: ${v}` : v)).join(' · ') };
}

/** Pares "etiqueta → valor" para el detalle (modal). */
export function auditDetails(row: Row): AuditDetail[] {
  return build(row).parts.filter(([, v]) => v !== '—').map(([l, v, ml]) => ({ label: l ?? ml ?? 'Resultado', value: v }));
}

/** Enlace a la ficha del Admin cuando existe una pantalla para ese tipo de registro. */
export function auditEntityLink(row: Pick<AdminAuditRow, 'entityType' | 'entityId'>): string | null {
  const id = encodeURIComponent(row.entityId);
  switch (row.entityType) {
    case 'Attendee':
      return `/admin/asistentes/${id}`;
    case 'Batch':
      return `/admin/lotes/${id}`;
    case 'User':
      return '/admin/usuarios';
    case 'Church':
      return '/admin/iglesias';
    case 'PackageBenefit':
      return '/admin/beneficios';
    case 'Dish':
      return '/admin/menu';
    case 'MerchItem':
      return '/admin/merch';
    default:
      return null;
  }
}

const ENTITY_TYPE: Record<string, string> = {
  User: 'Cuenta',
  Attendee: 'Asistente',
  Batch: 'Lote',
  AuditLog: 'Bitácora',
  Pulse: 'Pulsera',
  Redemption: 'Canje',
  Note: 'Nota',
  Setting: 'Ajuste',
  BlockedWord: 'Palabra bloqueada',
  Announcement: 'Aviso',
  Church: 'Iglesia',
  PackageBenefit: 'Beneficio',
  Dish: 'Platillo',
  MerchItem: 'Artículo',
};
export const auditEntityType = (t: string) => ENTITY_TYPE[t] ?? t;
/** Tipos que en español son femeninos (para "eliminada", no "eliminado"). */
const FEMININE = new Set(['User', 'Pulse', 'Note', 'Church', 'BlockedWord', 'AuditLog']);

/**
 * Texto de "Sobre": el identificador humano disponible. Prioridad: nombre legible → código → correo.
 * Sale del propio registro (metadata); el dato que trae el servidor por JOIN solo respalda a registros viejos.
 * Nunca un id técnico si hay algo mejor.
 */
export function auditTarget(row: Row): string {
  const m = obj(row.metadata);
  let found = '';
  switch (row.entityType) {
    case 'User': {
      const name = str(m.name) || str(row.entityName);
      const email = str(m.email) || str(row.entityEmail);
      found = name && email && name !== email ? `${name} (${email})` : name || email;
      break;
    }
    case 'Batch':
      found = str(m.code) || str(row.entityCode) || str(row.entityName);
      break;
    case 'Attendee':
      found = str(row.entityName) || attendeeOf(row, m);
      break;
    case 'Pulse': {
      const name = str(m.attendeeName) || str(row.entityName);
      const code = pulseCode(str(m.newCode) || str(row.entityCode));
      found = name && code ? `${name} · ${code}` : name || code;
      break;
    }
    case 'Redemption':
    case 'Note':
      found = str(m.attendeeName) || str(row.entityName);
      break;
    case 'Church':
      found = churchOf(row, m);
      break;
    case 'PackageBenefit': {
      const label = str(m.label) || str(obj(m.label).to);
      found = [str(m.kit), label].filter(Boolean).join(' · ');
      break;
    }
    case 'Dish':
      found = str(m.name) || str(m.dish) || str(obj(m.name).to) || str(row.entityName);
      break;
    case 'MerchItem':
      found = str(m.name) || str(m.item) || str(obj(m.name).to) || str(row.entityName);
      break;
    case 'Announcement':
      found = str(m.title);
      break;
    case 'Setting':
      found = row.entityId === 'avatarMode' ? 'Tipo de avatar' : row.entityId;
      break;
    case 'BlockedWord':
      found = str(m.to) || str(row.entityId);
      break;
    default:
      found = str(row.entityName);
  }
  if (found) return found;
  return `${auditEntityType(row.entityType)} ${FEMININE.has(row.entityType) ? 'eliminada' : 'eliminado'}`;
}
