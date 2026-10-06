import type { PageSize } from './api';

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

export type AuditCategory = 'usuarios' | 'lotes' | 'asistentes' | 'pulseras' | 'canjes' | 'notas' | 'avisos' | 'iglesias' | 'beneficios' | 'ajustes' | 'otros';

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

const yes = (v: unknown) => (v ? 'Sí' : 'No');
const text = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const ROLE: Record<string, string> = { ADMIN: 'Administrador', STAFF: 'Staff' };
const AVATAR: Record<string, string> = { blobatar: 'Avatares Blobatar', initials: 'Iniciales' };
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Pares "etiqueta → valor" para mostrar el `metadata` de un evento sin enseñar JSON. */
export function auditDetails(row: Pick<AdminAuditRow, 'action' | 'entityId' | 'metadata'>): AuditDetail[] {
  const m = obj(row.metadata);
  switch (row.action) {
    case 'user.create':
      return [
        { label: 'Correo', value: text(m.email) },
        { label: 'Rol', value: ROLE[String(m.role)] ?? text(m.role) },
        { label: 'Contraseña temporal', value: yes(m.temporary) },
      ];
    case 'user.update': {
      const before = obj(m.before);
      const after = obj(m.after);
      const name: Record<string, string> = { name: 'Nombre', role: 'Rol', active: 'Cuenta activa' };
      const fmt = (k: string, v: unknown) => (k === 'role' ? ROLE[String(v)] ?? text(v) : k === 'active' ? yes(v) : text(v));
      return Object.keys(after).map((k) => ({ label: name[k] ?? k, value: `${fmt(k, before[k])} → ${fmt(k, after[k])}` }));
    }
    case 'user.password_reset':
      return [{ label: 'Resultado', value: 'Se asignó una contraseña temporal; la persona debe crear la suya' }];
    case 'user.delete':
      return [
        { label: 'Nombre', value: text(m.name) },
        { label: 'Correo', value: text(m.email) },
        { label: 'Rol', value: ROLE[String(m.role)] ?? text(m.role) },
      ];
    case 'user.password_change':
      return [{ label: 'Resultado', value: 'La persona cambió su propia contraseña' }];
    case 'batch.create':
      return [
        { label: 'Código del lote', value: text(m.code) },
        { label: 'Pulseras', value: text(m.quantity) },
      ];
    case 'batch.delete':
      return [
        { label: 'Código del lote', value: text(m.code) },
        { label: 'Pulseras borradas', value: text(m.pulses) },
        { label: 'Asistentes borrados', value: text(m.attendees) },
        { label: 'Canjes borrados', value: text(m.redemptions) },
        { label: 'Notas borradas', value: text(m.notes) },
      ];
    case 'attendee.update': {
      const label: Record<string, string> = { fullName: 'Nombre', ageRange: 'Rango de edad', church: 'Iglesia' };
      return Object.entries(m).map(([k, v]) => {
        const c = obj(v);
        return { label: label[k] ?? k, value: `${text(c.from)} → ${text(c.to)}` };
      });
    }
    case 'pulse.reassign':
      return [
        { label: 'Aguas ya canjeadas que se conservan', value: text(m.drinksUsed) },
        { label: 'Resultado', value: 'La pulsera anterior quedó invalidada y la nueva pasó a ser la activa' },
      ];
    case 'redemption.void':
      return [
        { label: 'Motivo', value: text(m.reason) },
        { label: 'Aguas del canje', value: text(m.quantity) },
        { label: 'Beneficio devuelto a la pulsera', value: yes(m.restored) },
      ];
    case 'note.retire':
      return [
        { label: 'Motivo', value: text(m.reason) },
        { label: 'Texto de la nota', value: text(m.text) },
      ];
    case 'blocked_word.update':
      return [{ label: 'Cambió', value: `${text(m.from)} → ${text(m.to)}` }];
    case 'blocked_word.add':
    case 'blocked_word.remove':
      return [{ label: 'Palabra o frase', value: text(m.word) }];
    case 'announcement.create':
      return [
        { label: 'Título', value: text(m.title) },
        { label: 'Para', value: m.audience === 'ALL' ? 'Todos' : text(m.audience) },
        { label: 'Programado', value: m.scheduled ? `Sí (${text(m.publishAt)})` : 'No, se publicó al momento' },
      ];
    case 'announcement.retire':
      return [
        { label: 'Título', value: text(m.title) },
        { label: 'Para', value: m.audience === 'ALL' ? 'Todos' : text(m.audience) },
      ];
    case 'church.create':
      return [
        { label: 'Iglesia', value: text(m.name) },
        { label: 'Presbiterio', value: text(m.presbytery) },
        { label: 'Zona', value: text(m.zone) },
      ];
    case 'church.update': {
      const label: Record<string, string> = { name: 'Nombre', presbytery: 'Presbiterio', zone: 'Zona' };
      return Object.entries(m).map(([k, v]) => {
        const c = obj(v);
        return { label: label[k] ?? k, value: `${text(c.from)} → ${text(c.to)}` };
      });
    }
    case 'church.delete':
      return [
        { label: 'Iglesia', value: text(m.name) },
        { label: 'Presbiterio', value: text(m.presbytery) },
      ];
    case 'benefit.create':
    case 'benefit.delete':
      return [
        { label: 'Kit', value: text(m.kit) },
        { label: 'Beneficio', value: text(m.label) },
      ];
    case 'benefit.update': {
      const c = obj(m.label);
      return [
        { label: 'Kit', value: text(m.kit) },
        { label: 'Cambió', value: `${text(c.from)} → ${text(c.to)}` },
      ];
    }
    case 'benefit.move':
      return [
        { label: 'Kit', value: text(m.kit) },
        { label: 'Beneficio', value: text(m.label) },
        { label: 'Lo movió', value: text(m.dir) },
      ];
    case 'setting.update':
      return [
        { label: 'Ajuste', value: row.entityId === 'avatarMode' ? 'Tipo de avatar' : text(row.entityId) },
        { label: 'Antes', value: AVATAR[String(m.previous)] ?? text(m.previous) },
        { label: 'Ahora', value: AVATAR[String(m.value)] ?? text(m.value) },
      ];
    default:
      // Acción que este catálogo todavía no conoce: se muestra tal cual, sin la huella `fp`.
      return Object.entries(m)
        .filter(([k]) => k !== 'fp')
        .map(([k, v]) => ({ label: k, value: typeof v === 'object' ? JSON.stringify(v) : text(v) }));
  }
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
};
export const auditEntityType = (t: string) => ENTITY_TYPE[t] ?? t;

/** Texto de "Sobre": el nombre resuelto por el servidor o, si no existe, algo legible (nunca un id crudo si se puede evitar). */
export function auditTarget(row: Pick<AdminAuditRow, 'entityType' | 'entityId' | 'entityName'> & { metadata?: Record<string, unknown> | null }): string {
  if (row.entityName) return row.entityName;
  // Los avisos no se unen a su tabla (así Auditoría no depende de la migración 006): el título va en el metadata.
  if (row.entityType === 'Announcement' && row.metadata && typeof row.metadata.title === 'string') return row.metadata.title;
  // Iglesias y beneficios: el nombre va en el metadata (también cuando ya se eliminaron).
  if (row.entityType === 'Church' && row.metadata && typeof row.metadata.name === 'string') return row.metadata.name;
  if (row.entityType === 'PackageBenefit' && row.metadata && typeof row.metadata.label === 'string') return row.metadata.label;
  if (row.entityType === 'Setting' && row.entityId === 'avatarMode') return 'Tipo de avatar';
  if (row.entityType === 'BlockedWord') return row.entityId;
  const fem = row.entityType === 'Church' || row.entityType === 'Pulse' || row.entityType === 'Note';
  return `${auditEntityType(row.entityType)} ${fem ? 'eliminada' : 'eliminado'}`;
}
