/**
 * Contrato entre el frontend de Vite y sus funciones de servidor
 * (netlify/functions). Tipos y constantes que usan ambos lados.
 */

export type { Church } from './churches';

/**
 * Rangos de edad: IDÉNTICOS al CHECK "attendee_age_range_valid" de Neon y a
 * src/lib/age-ranges.ts del Next.js. La base rechaza cualquier otro valor.
 */
export const AGE_RANGES = ['16-18', '19-21', '22-24', '25-27', '28-30', '31-34', '35+'] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

export function isValidAgeRange(value: string): value is AgeRange {
  return (AGE_RANGES as readonly string[]).includes(value);
}

/** qrToken: 16 caracteres base62 (tokens.ts del Next.js). */
export const QR_TOKEN_RE = /^[0-9A-Za-z]{16}$/;

/**
 * La Etapa 3 decided (1 oct 2026) que la pulsera se identifica SOLO por
 * `qrToken`. No se generan códigos manuales nuevos.
 *
 * La columna "Pulse"."manualCode" sigue existiendo en Neon como TEXT NOT NULL
 * UNIQUE (es parte de 0001_init y no se puede tocar sin romper al Next.js que
 * comparte la base), así que cada INSERT debe llenarla. Cuando no hay código
 * manual se escribe este centinela: `QRONLY:<qrToken>`. Nunca puede
 * confundirse con un código real porque
 * `MANUAL_CODE_RE = /^AR26-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/` no lo
 * acepta.
 *
 * OJO (corregido por Claude, 1 oct 2026): el centinela SÍ llega a Staff. El
 * escaneo y la búsqueda devuelven `manualCode`, y el modal de canje lo manda
 * de vuelta a /api/staff/redeem como identificador de la pulsera. Por eso
 * Staff acepta los dos formatos (`normalizeStaffCode`) y en pantalla se
 * muestra con `pulseCodeLabel` (nunca "QRONLY:…").
 */
export const MANUAL_CODE_SENTINEL_PREFIX = 'QRONLY:';

/**
 * Identificador con el que Staff abre y canjea una pulsera:
 * - `AR26-XXXXX` (pulseras anteriores a la Etapa 3; se normaliza a mayúsculas)
 * - `QRONLY:<qrToken>` (pulseras creadas en Lotes; el token distingue
 *   mayúsculas y minúsculas, así que se respeta tal cual)
 * Cualquier otra cosa → null.
 */
export function normalizeStaffCode(raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  if (value.startsWith(MANUAL_CODE_SENTINEL_PREFIX)) {
    return QR_TOKEN_RE.test(value.slice(MANUAL_CODE_SENTINEL_PREFIX.length)) ? value : null;
  }
  const upper = value.toUpperCase();
  return MANUAL_CODE_RE.test(upper) ? upper : null;
}

/** Cómo se ve el identificador en pantalla: `AR26-XXXXX` o `QR aBcD…` (igual que la tabla de Lotes). */
export function pulseCodeLabel(code: string): string {
  return code.startsWith(MANUAL_CODE_SENTINEL_PREFIX)
    ? `QR ${code.slice(MANUAL_CODE_SENTINEL_PREFIX.length, MANUAL_CODE_SENTINEL_PREFIX.length + 4)}…`
    : code;
}

/** Cabecera con la que el asistente manda el token de su pulsera. */
export const PULSE_TOKEN_HEADER = 'x-pulse-token';

export type PackageSummary = {
  name: string;
  /** Centavos de MXN, tal cual Neon. */
  price: number;
  includedDrinks: number;
};

/** GET /api/pulse/:token -- estado público de una pulsera (sin datos personales). */
export type PulseStatusResponse =
  | { status: 'not_found' }
  | { status: 'invalidated' }
  | { status: 'active' }
  | { status: 'unclaimed'; package: PackageSummary };

/** POST /api/claim */
export type ClaimRequest = { token: string; fullName: string; ageRange: string; churchId: string };
export type ClaimResponse =
  | { outcome: 'claimed' }
  | { outcome: 'already_active' }
  | { outcome: 'invalidated' }
  | { outcome: 'not_found' };

/** GET /api/me (con la cabecera x-pulse-token). */
export type MeResponse = {
  attendee: {
    /** Attendee.id: solo se usa como semilla del avatar (`attendeeAvatarSeed`). */
    id: string;
    fullName: string;
    ageRange: string | null;
    churchName: string;
    presbyteryName: string;
    zoneName: string;
  };
  package: PackageSummary;
  drinksUsed: number;
  drinksRemaining: number;
};

/** Cuerpo de cualquier error de las funciones. */
export type ApiError = { error: string; status?: PulseStatusResponse['status']; mustChangePassword?: boolean };

/* ------------------------------------------------------------------ */
/* Staff / Admin                                                        */
/* ------------------------------------------------------------------ */

export type StaffRole = 'ADMIN' | 'STAFF';
export type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  /** true = entró con una contraseña temporal y debe crear la suya antes de continuar. */
  mustChangePassword?: boolean;
};

/** POST /api/auth/password -- el propio usuario cambia su contraseña. */
export type ChangePasswordRequest = { currentPassword: string; newPassword: string };

/** Admin -> Usuarios */
export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  /** Todavía no cambia la contraseña temporal. */
  pendingPassword: boolean;
};
export type CreateUserRequest = { name: string; email: string; role: StaffRole; temporaryPassword: string };
export type UpdateUserRequest = { name?: string; role?: StaffRole; active?: boolean };
export type ResetPasswordRequest = { temporaryPassword: string };

/* ------------------------------------------------------------------ */
/* Admin -> Lotes (Etapa 3)                                            */
/* ------------------------------------------------------------------ */

/** Cantidad de pulseras por lote. 1 a 500 (decisión del 1 oct 2026). */
export const MIN_BATCH_PULSES = 1;
export const MAX_BATCH_PULSES = 500;

/** Nombre/identificador del lote: 1 a 40 caracteres seguros. */
export const BATCH_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,39}$/;

/**
 * Estados de `Batch."status"` (columna agregada por migrations/001_batch_status.sql).
 * La Etapa 3 solo escribe ABIERTO. CERRADO y CANCELADO están reservados: el
 * botón "Cerrar lote" NO existe todavía.
 */
export type BatchStatus = 'ABIERTO' | 'CERRADO' | 'CANCELADO';

/** Los 3 valores del enum de Neon "PulseStatus". */
export type PulseStatus = 'UNCLAIMED' | 'ACTIVE' | 'INVALIDATED';

export type AdminBatchRow = {
  id: string;
  code: string;
  status: BatchStatus;
  packageId: string;
  packageName: string;
  /** Centavos de MXN, tal cual Neon (columna `price`, NO `priceCents`). */
  packagePrice: number;
  /** Intención declarada al crear el lote. */
  quantity: number;
  createdBy: string;
  createdAt: string;
  /** Filas reales de "Pulse" del lote. */
  total: number;
  unclaimed: number;
  active: number;
  invalidated: number;
};

export type CreateBatchRequest = { code: string; packageId: string; quantity: number };
export type CreateBatchResponse = { id: string; code: string; quantity: number };

export type AdminPulseRow = {
  id: string;
  /** Token completo: la credencial de la pulsera. */
  qrToken: string;
  /** Versión corta para la tabla (`aBcD…`). El completo solo se usa al copiar. */
  shortToken: string;
  /** `{PUBLIC_BASE_URL}/p/{qrToken}`. Lo arma el servidor; vacío si falta PUBLIC_BASE_URL. */
  qrUrl: string;
  status: PulseStatus;
  packageName: string;
  drinksUsed: number;
  createdAt: string;
  claimedAt: string | null;
  /** Solo lectura. La lista/búsqueda por asistente es Etapa 4. */
  attendeeName: string | null;
  /** Attendee.id (semilla del avatar); null si la pulsera no está reclamada. */
  attendeeId: string | null;
  /** Número de la pulsera dentro del lote (1..N, por orden de creación). Estable aunque se filtre. */
  position: number;
};

/**
 * GET /api/admin/batches/:id?page=&pageSize=&q=&status= -- el lote y UNA
 * página de sus pulseras (paginación y búsqueda en el servidor).
 */
export type AdminBatchDetail = AdminBatchRow & {
  pulses: AdminPulseRow[];
  /** Pulseras que cumplen la búsqueda/estado (las de `total` si no hay filtros). */
  filteredTotal: number;
  /** Página devuelta (0-based, ya ajustada si venía fuera de rango). */
  page: number;
  pageSize: number;
  /** Origen de los QR (PUBLIC_BASE_URL o el de desarrollo); '' si no hay dominio. */
  qrBase: string;
};
export type BatchPulseFilters = { page?: number; pageSize?: number; q?: string; status?: PulseStatus | '' };

/** GET /api/admin/batches: el listado y los paquetes que necesita el alta. */
export type AdminBatchesResponse = {
  batches: AdminBatchRow[];
  packages: (PackageSummary & { id: string; active: boolean })[];
};

/** Formatos de papel del PDF de pulseras. */
export const PAPER_SIZES = ['a4', 'letter', 'tabloid'] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];
export const PAPER_SIZE_LABELS: Record<PaperSize, string> = {
  a4: 'A4 · 210 × 297 mm',
  letter: 'Carta / Letter · 8.5 × 11 in',
  tabloid: '11 × 17 in / Tabloide',
};

/* ------------------------------------------------------------------ */
/* Admin -> Asistentes (Etapa 4)                                       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Paginación (regla global de tablas, handoff §37)                     */
/* ------------------------------------------------------------------ */

/** Tamaños de página permitidos en TODAS las tablas. 10 = mínimo y valor inicial. */
export const PAGE_SIZES = [10, 25, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 10;

/** Normaliza un tamaño de página que viene de la URL o de la query string. */
export function parsePageSize(raw: unknown): PageSize {
  const n = Number(raw);
  return (PAGE_SIZES as readonly number[]).includes(n) ? (n as PageSize) : DEFAULT_PAGE_SIZE;
}

/** Estado de las aguas del asistente (filtro "Estado" de la lista). */
export type DrinksFilter = 'available' | 'exhausted' | 'none';

/** GET /api/admin/attendees?q=&zoneId=&presbyteryId=&churchId=&packageId=&drinks=&page= */
export type AdminAttendeeFilters = {
  q?: string;
  zoneId?: string;
  presbyteryId?: string;
  churchId?: string;
  packageId?: string;
  drinks?: DrinksFilter | '';
  /** 0-based. */
  page?: number;
  pageSize?: PageSize;
};

export type AdminAttendeeRow = {
  id: string;
  fullName: string;
  /** Rango de edad (columna "ageRange"). */
  ageRange: string | null;
  /** Edad numérica de registros viejos del Next.js (columna "age"); casi siempre null. */
  age: number | null;
  churchName: string;
  presbyteryName: string;
  zoneName: string;
  packageName: string;
  includedDrinks: number;
  drinksUsed: number;
  createdAt: string;
};

export type AdminAttendeesResponse = { total: number; page: number; pageSize: number; rows: AdminAttendeeRow[] };

/** GET /api/admin/attendees/catalog -- opciones de los filtros. */
export type AdminAttendeesCatalog = {
  zones: { id: string; name: string }[];
  presbyteries: { id: string; name: string; zoneId: string }[];
  churches: { id: string; name: string; presbyteryId: string }[];
  packages: { id: string; name: string }[];
};

/** GET /api/admin/attendees/:id */
export type AdminAttendeeDetail = {
  id: string;
  fullName: string;
  ageRange: string | null;
  age: number | null;
  churchId: string;
  churchName: string;
  presbyteryName: string;
  zoneName: string;
  createdAt: string;
  /** Todas sus pulseras: primero la activa, luego las reemplazadas. */
  pulses: {
    id: string;
    label: string;
    status: PulseStatus;
    batchId: string;
    batchCode: string;
    packageName: string;
    includedDrinks: number;
    drinksUsed: number;
    claimedAt: string | null;
    updatedAt: string;
  }[];
  /** Canjes de aguas frescas, del más reciente al más antiguo. */
  redemptions: { id: string; createdAt: string; staffName: string; pulseLabel: string }[];
};

/** PATCH /api/admin/attendees/:id -- corrección de datos (Admin). */
export type UpdateAttendeeRequest = { fullName: string; ageRange: string; churchId: string };

/** POST /api/auth/login */
export type LoginRequest = { email: string; password: string };

/** Código de respaldo impreso en la pulsera: AR26-XXXXX (alfabeto sin 0/O/1/I/L). */
export const MANUAL_CODE_RE = /^AR26-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/;

/** GET /api/staff/pulse?token=… | ?code=… */
export type StaffPulseResponse =
  | { status: 'not_found' }
  | { status: 'unclaimed'; manualCode: string; packageName: string }
  | { status: 'invalidated'; manualCode: string }
  | {
      status: 'active';
      manualCode: string;
      attendee: { fullName: string; churchName: string; presbyteryName: string; zoneName: string };
      package: { name: string; includedDrinks: number };
      drinksUsed: number;
      drinksRemaining: number;
    };

/** GET /api/staff/search?q=…&churchId=… -- solo pulseras ACTIVAS. */
export type StaffSearchResult = {
  manualCode: string;
  fullName: string;
  churchName: string;
  packageName: string;
  includedDrinks: number;
  drinksRemaining: number;
};

/**
 * POST /api/staff/reassign -- reemplazar la pulsera de un asistente.
 * `manualCode` = identificador de la pulsera ACTUAL (el del modal de Staff);
 * `newToken` = qrToken de la pulsera NUEVA (escaneada, sin reclamar, mismo kit).
 * La actual queda INVALIDATED ("Deshabilitada") y la nueva ACTIVE para el mismo
 * asistente, conservando las aguas frescas ya canjeadas.
 */
export type ReassignRequest = { manualCode: string; newToken: string };
export type ReassignResponse =
  | { outcome: 'ok'; newCode: string; drinksUsed: number; drinksRemaining: number }
  | { outcome: 'old_not_active' }
  | { outcome: 'new_not_found' }
  | { outcome: 'new_not_available'; status: 'active' | 'invalidated' }
  | { outcome: 'same_pulse' }
  | { outcome: 'different_kit'; oldKit: string; newKit: string };

/** POST /api/staff/redeem -- descuenta exactamente 1 agua fresca. */
export type RedeemRequest = { manualCode: string; idempotencyKey: string };
export type RedeemResponse =
  | { outcome: 'ok'; drinksRemaining: number }
  | { outcome: 'already_processed'; drinksRemaining: number }
  | { outcome: 'insufficient_balance'; drinksRemaining: number }
  | { outcome: 'pulse_not_active' };

/** GET /api/staff/history -- los canjes del Staff de la sesión (los más recientes primero). */
export type StaffHistoryRow = {
  id: string;
  createdAt: string;
  attendeeName: string;
  pulseLabel: string;
  quantity: number;
  status: RedemptionStatus;
};
export type StaffHistoryResponse = { rows: StaffHistoryRow[] };

/* ------------------------------------------------------------------ */
/* Admin -> Canjes (Etapa 6, parte Admin)                               */
/*                                                                      */
/* No hay columna de estado en "Redemption" (ni falta: ver reglas de     */
/* server/db.ts de no tocar el esquema que comparte Prisma). Un canje    */
/* "anulado" se representa con una fila en "AuditLog" (la misma tabla    */
/* que ya usan pulse.reassign y attendee.update):                        */
/*   action = 'redemption.void', entityType = 'Redemption',              */
/*   entityId = Redemption.id, metadata = { reason, restored, ... }      */
/* `RedemptionStatus` es un valor CALCULADO (join con AuditLog), nunca    */
/* una columna real. El registro original de "Redemption" nunca se       */
/* borra ni se modifica -- "anular" solo agrega el AuditLog y, si hay     */
/* una pulsera activa para restaurar, descuenta su "drinksUsed".          */
/* ------------------------------------------------------------------ */

export type RedemptionStatus = 'VALIDO' | 'ANULADO';

export type AdminRedemptionFilters = {
  /** Nombre del asistente (cada palabra, sin acentos, como Asistentes). */
  q?: string;
  /** Código de pulsera (AR26-XXXXX o QRONLY:<token>), exacto o parcial. */
  manualCode?: string;
  status?: RedemptionStatus | '';
  staffId?: string;
  /** YYYY-MM-DD (hora de Tijuana), inclusive. */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: PageSize;
};

export type AdminRedemptionRow = {
  id: string;
  createdAt: string;
  attendeeId: string;
  attendeeName: string;
  pulseLabel: string;
  packageName: string;
  quantity: number;
  staffId: string;
  staffName: string;
  status: RedemptionStatus;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
};

export type AdminRedemptionsResponse = { total: number; page: number; pageSize: number; rows: AdminRedemptionRow[] };

/** Catálogo para el filtro "Staff" de Canjes (solo quienes han hecho algún canje). */
export type AdminRedemptionsCatalog = { staff: { id: string; name: string }[] };

/** POST /api/admin/redemptions/:id/void -- el motivo es obligatorio (no vacío ni solo espacios). */
export type VoidRedemptionRequest = { reason: string };
export type VoidRedemptionResponse =
  | { outcome: 'ok'; restored: boolean }
  | { outcome: 'already_voided' }
  | { outcome: 'not_found' };

/* ------------------------------------------------------------------ */
/* Admin -> Dashboard (Etapa 7)                                         */
/* ------------------------------------------------------------------ */

/**
 * Zona horaria del congreso. Neon guarda las fechas en UTC (TIMESTAMP sin
 * zona, como Prisma); TODO lo que el Dashboard agrupa por día u hora se
 * convierte primero a esta zona. "Hoy" = el día calendario en Tijuana.
 */
export const EVENT_TIMEZONE = 'America/Tijuana';

/** Días del congreso (README: sábado 17 y domingo 18 de octubre de 2026). */
export const EVENT_DAYS = [
  { date: '2026-10-17', label: 'Sábado 17' },
  { date: '2026-10-18', label: 'Domingo 18' },
] as const;

/**
 * Periodo del Dashboard: `all` (todo), `today`, `yesterday` o un día
 * `YYYY-MM-DD` (en hora de Tijuana). Ver `docs/CLAUDE_HANDOFF.md` §34 para
 * qué módulos respetan el periodo.
 */
export type DashboardPeriod = 'all' | 'today' | 'yesterday' | `${number}-${number}-${number}`;
export const DASHBOARD_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Filtros globales del Dashboard (query string de GET /api/admin/dashboard). */
export type DashboardFilters = {
  period?: DashboardPeriod;
  zoneId?: string;
  presbyteryId?: string;
  churchId?: string;
  packageId?: string;
};

/** Cada cuánto se refresca el Dashboard solo (ms). */
export const DASHBOARD_REFRESH_MS = 60_000;

/**
 * Umbrales de las alertas operativas. Están aquí (y documentados en el
 * handoff §34.6) para que no sean números mágicos dentro del código.
 */
export const DASHBOARD_THRESHOLDS = {
  /** % de aguas incluidas ya canjeadas: aviso y crítico. */
  drinksWarnPct: 80,
  drinksCriticalPct: 95,
  /** Lote ABIERTO con ≤ este % de pulseras sin reclamar (y al menos `batchMinSize` pulseras). */
  batchLowPct: 10,
  batchMinSize: 10,
  /** Kit con ≤ este % de sus pulseras sin reclamar (y al menos `kitMinSize` pulseras). */
  kitLowPct: 5,
  kitMinSize: 20,
  /** Minutos sin registros ni canjes (en día de congreso, en horario de operación) para avisar. */
  idleMinutes: 30,
  /** Horario de operación en hora de Tijuana: [desde, hasta) en horas. */
  operatingHours: [9, 22] as const,
} as const;

export type DashboardCount = { id: string; name: string; count: number };

export type DashboardKit = {
  packageId: string;
  name: string;
  /** Centavos de MXN (columna `price` de "Package"). */
  price: number;
  includedDrinks: number;
  /** Asistentes registrados con este kit (en el periodo y filtros). */
  count: number;
  /** count × price, en centavos. NO son pagos. */
  valueCents: number;
};

export type DashboardActivity = {
  /** registration = alta del asistente · redemption = canje de agua · reassign = reemplazo de pulsera */
  type: 'registration' | 'redemption' | 'reassign';
  id: string;
  /** ISO UTC. */
  at: string;
  attendeeId: string;
  attendeeName: string;
  ageRange: string | null;
  churchName: string;
  packageName: string;
  /** Quién lo hizo (canje y reemplazo). */
  staffId: string | null;
  staffName: string | null;
  /** Aguas del canje (siempre 1 hoy). */
  quantity: number | null;
};

export type DashboardAlert = {
  id: string;
  level: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
};

/** GET /api/admin/dashboard */
export type DashboardResponse = {
  /** ISO UTC del momento en que se calcularon los datos. */
  generatedAt: string;
  /** Hoy y ayer en Tijuana (YYYY-MM-DD). */
  today: string;
  yesterday: string;
  /** Día que usan "por hora" y "velocidad": el del periodo, o hoy si el periodo es "todo". */
  focusDay: string;
  /** Filtros que el servidor aplicó (ya validados). */
  filters: Required<DashboardFilters>;

  /** Asistentes registrados (pulsera ACTIVE) en el periodo y filtros. */
  registered: number;
  /** Registros de hoy y de ayer (respetan zona/presbiterio/iglesia/kit, NO el periodo). */
  registeredToday: number;
  registeredYesterday: number;
  /** Σ Package.price de los registrados (centavos). Valor estimado, NO pagos. */
  valueCents: number;
  /** Saldo de aguas de los registrados (snapshot de sus pulseras ACTIVE). */
  drinks: { included: number; used: number; remaining: number };
  kits: DashboardKit[];
  /** Cuántas iglesias / presbiterios / zonas distintas tienen al menos un registrado. */
  coverage: { churches: number; presbyteries: number; zones: number };

  /** Pulseras por estado (todas las de "Pulse"; solo respeta el filtro de kit). */
  pulses: { total: number; active: number; unclaimed: number; invalidated: number };

  /** Registros por día (todos los días con datos; NO respeta el periodo). */
  byDay: { day: string; registrations: number; redemptions: number; drinks: number }[];
  /** 24 horas del `focusDay`. */
  byHour: { hour: number; registrations: number; redemptions: number }[];
  velocity: {
    /** Registros en los últimos 60 min (null si `focusDay` no es hoy). */
    lastHour: number | null;
    /** Registros por hora entre la primera hora con registros y la hora actual/última (null si < 2 registros). */
    avgPerHour: number | null;
    /** Hora con más registros del `focusDay` (null si no hay registros). */
    peak: { hour: number; count: number } | null;
  };

  byZone: DashboardCount[];
  byPresbytery: (DashboardCount & { zoneName: string })[];
  topChurches: (DashboardCount & { presbyteryName: string })[];
  /** Por rango de edad, en el orden de AGE_RANGES; `null` = sin dato. */
  ages: { range: string | null; count: number }[];

  /** Canjes ("Redemption") en el periodo y filtros. */
  redemptions: { count: number; drinks: number; byStaff: (DashboardCount & { lastAt: string })[] };

  /** Comparativa de los días del congreso (null si ninguno tiene actividad todavía). */
  eventDays: { day: string; label: string; registrations: number; redemptions: number; drinks: number }[] | null;

  batches: {
    id: string;
    code: string;
    status: BatchStatus;
    packageId: string;
    packageName: string;
    total: number;
    active: number;
    unclaimed: number;
    invalidated: number;
  }[];

  activity: DashboardActivity[];
  alerts: DashboardAlert[];
};

/* ------------------------------------------------------------------ */
/* Configuración global de la app                                      */
/* ------------------------------------------------------------------ */

/**
 * Cómo se dibujan los avatares de personas en TODA la app (lo decide
 * `UserAvatar`). Configuración global, no por usuario. Ver handoff §36.
 */
export const AVATAR_MODES = ['blobatar', 'initials'] as const;
export type AvatarMode = (typeof AVATAR_MODES)[number];
/** Valor inicial: Blobatar (lo que ya se usaba al crear la configuración). */
export const DEFAULT_AVATAR_MODE: AvatarMode = 'blobatar';

export function isAvatarMode(value: unknown): value is AvatarMode {
  return (AVATAR_MODES as readonly unknown[]).includes(value);
}

/** GET /api/settings (público: lo necesita también la app del asistente). */
export type AppSettings = { avatarMode: AvatarMode };
/** PATCH /api/admin/settings (solo ADMIN). */
export type UpdateSettingsRequest = Partial<AppSettings>;
