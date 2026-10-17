import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { getPool } from './db';
import { json } from './http';
import { QR_TOKEN_RE } from '../shared/api';

/**
 * Límite de frecuencia (rate limiting) para las Netlify Functions.
 *
 * ALMACENAMIENTO: tabla "RateLimit" en Neon (migrations/011_rate_limit.sql). Las funciones son efímeras y hay
 * varias instancias a la vez, así que NO se usa memoria del proceso: todas cuentan en la misma fila.
 *   · UNA fila por clave (regla + huella), nunca una por solicitud.
 *   · Un solo INSERT ... ON CONFLICT DO UPDATE atómico por llamada (varias claves a la vez, en orden fijo para
 *     evitar interbloqueos). Ventana fija: el contador vuelve a 1 cuando pasa `resetAt`. El reloj es el de la base.
 *   · Las claves son HMAC (con SESSION_SECRET) de IP / correo / token / id: la base no guarda datos en claro.
 *
 * IP: SOLO `context.ip` de Netlify (en su runtime sale de la cabecera x-nf-client-connection-ip, que pone la
 * plataforma). NUNCA se lee X-Forwarded-For ni nada que mande el cliente. IPv6 se agrupa por /64. Sin IP válida
 * se usa un cubo compartido "sin-ip" (los límites por IP son holgados a propósito: ver abajo).
 *
 * OJO: en el congreso TODA la Wi-Fi del recinto sale con una sola IP pública. Por eso los límites por IP de los
 * asistentes cuentan FALLOS (tokens inventados, pulseras inexistentes), no volumen; el límite estricto es por
 * asistente (token), por cuenta o por pulsera.
 *
 * SI FALLA EL ALMACÉN
 *   · Tabla inexistente (migración 011 sin aplicar): se deja pasar y se registra "[ratelimit] ... no existe".
 *     Es el único caso de "abierto" para reglas sensibles, para que desplegar antes de migrar no tumbe el login.
 *   · Cualquier otro error: reglas `closed` (login, contraseña, registro, canjes, operaciones admin pesadas) -> 503
 *     con Retry-After; reglas `open` (lecturas) -> se deja pasar y se registra. Siempre se registra, sin claves ni IPs.
 * El límite NUNCA sustituye la autorización ni las protecciones transaccionales (idempotencyKey, UPDATE condicional...).
 */

export type Rule = {
  readonly name: string;
  readonly max: number;
  readonly windowSec: number;
  readonly onFail: 'open' | 'closed';
  /** Frase inicial del mensaje 429 (se le agrega "Espera N s e inténtalo de nuevo."). */
  readonly message?: string;
};

const rule = (name: string, max: number, windowSec: number, onFail: 'open' | 'closed', message?: string): Rule =>
  Object.freeze({ name, max, windowSec, onFail, message });

const LOGIN_MSG = 'Demasiados intentos de inicio de sesión.';

/** Fuente única de las políticas. Para cambiar un límite se cambia SOLO aquí (y en docs/RATE_LIMITING.md). */
export const RULES = {
  // --- Staff / Admin (cookie) ---
  login_pair: rule('login_pair', 5, 900, 'closed', LOGIN_MSG), // correo + IP: 5 intentos / 15 min
  login_ip: rule('login_ip', 40, 900, 'closed', LOGIN_MSG), //    una IP probando muchas cuentas (recinto compartido: holgado)
  login_id: rule('login_id', 20, 900, 'closed', LOGIN_MSG), //    una cuenta atacada desde muchas IP
  pwd_user: rule('pwd_user', 5, 900, 'closed', 'Demasiados intentos de cambiar la contraseña.'),
  staff_base: rule('staff_base', 600, 60, 'open'), //             tope general por cuenta (cualquier ruta protegida)
  staff_lookup: rule('staff_lookup', 120, 60, 'open'), //         escaneo / búsqueda de pulseras
  staff_miss: rule('staff_miss', 40, 600, 'open'), //             códigos inexistentes por cuenta (adivinar códigos)
  staff_redeem: rule('staff_redeem', 90, 60, 'closed'), //        canjes por cuenta
  redeem_pulse: rule('redeem_pulse', 15, 60, 'closed'), //        canjes sobre una misma pulsera
  staff_reassign: rule('staff_reassign', 20, 600, 'closed'),
  admin_heavy: rule('admin_heavy', 12, 600, 'closed'), //         exportar, PDF de lote, crear lotes
  admin_imgsearch: rule('admin_imgsearch', 30, 600, 'closed'), // buscar imagen en Openverse (servicio externo)
  admin_user_w: rule('admin_user_w', 20, 600, 'closed'), //       crear/editar/borrar cuentas y contraseñas
  admin_danger: rule('admin_danger', 20, 600, 'closed'), //       purgar auditoría, borrar lote, desvincular, anular
  raffle_draw: rule('raffle_draw', 30, 60, 'closed'), //         sorteos (rifas) por cuenta de Admin
  // --- Públicas (sin sesión) ---
  raffle_public: rule('raffle_public', 240, 60, 'open'), //      proyector de la rifa (consulta periódica), por IP
  claim_ip: rule('claim_ip', 1200, 600, 'closed'), //             registros por IP (recinto compartido: ~2/s)
  tok_miss_ip: rule('tok_miss_ip', 200, 600, 'open'), //          pulseras inexistentes por IP (adivinar QR)
  claim_token: rule('claim_token', 15, 600, 'open'), //           reintentos sobre una misma pulsera
  bad_token_ip: rule('bad_token_ip', 600, 600, 'open'), //        tokens de asistente inválidos por IP
  // --- Asistente (x-pulse-token) ---
  att_me: rule('att_me', 60, 60, 'open'),
  att_profile_r: rule('att_profile_r', 60, 60, 'open'),
  att_profiles: rule('att_profiles', 30, 60, 'open'),
  att_notes_r: rule('att_notes_r', 30, 60, 'open'),
  att_feed: rule('att_feed', 30, 60, 'open'),
  att_notif: rule('att_notif', 30, 60, 'open'),
  att_seen: rule('att_seen', 20, 60, 'open'),
  att_likers: rule('att_likers', 30, 60, 'open'),
  att_like: rule('att_like', 40, 60, 'open'),
  att_note_w: rule('att_note_w', 10, 600, 'open'),
  att_profile_w: rule('att_profile_w', 10, 600, 'open'),
  att_photo: rule('att_photo', 5, 600, 'closed'), //              subir foto (almacenamiento + procesamiento)
} as const satisfies Record<string, Rule>;

/** Una "pregunta" al almacén: ¿puedo gastar `inc` de esta regla para esta identidad? `inc: 0` solo consulta. */
export type Hit = { rule: Rule; id: string; inc?: number };

export type StoreItem = { key: string; windowSec: number; inc: number };
export type StoreRow = { key: string; count: number; retryAfter: number };

export interface Store {
  /** Suma `inc` a cada clave (creándola / reiniciándola si venció) y devuelve su estado. Atómico. */
  consume(items: StoreItem[]): Promise<StoreRow[]>;
  /** Resta 1 (mínimo 0) a las claves vigentes. */
  refund(keys: string[]): Promise<void>;
  /** Borra filas vencidas hace rato. */
  cleanup(): Promise<void>;
}

/**
 * Tiempo máximo que se espera al almacén. Neon "duerme" el cómputo en el plan gratuito y despertar puede tardar varios
 * segundos (db.ts espera hasta 15 s al conectar): 8 s evita dar un 503 falso en el primer intento tras un rato de calma,
 * y queda por debajo de los 10 s por defecto de una Netlify Function.
 */
let storeTimeoutMs = 8000;
export function setStoreTimeoutForTests(ms: number) {
  storeTimeoutMs = ms;
}

const CONSUME_SQL = `
  INSERT INTO "RateLimit" ("key", "count", "resetAt")
  SELECT t.k, t.n, now() + make_interval(secs => t.w)
    FROM unnest($1::text[], $2::int[], $3::int[]) AS t(k, w, n)
   ORDER BY t.k
  ON CONFLICT ("key") DO UPDATE
     SET "count"   = CASE WHEN "RateLimit"."resetAt" <= now() THEN EXCLUDED."count" ELSE "RateLimit"."count" + EXCLUDED."count" END,
         "resetAt" = CASE WHEN "RateLimit"."resetAt" <= now() THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
  RETURNING "key", "count", GREATEST(CEIL(EXTRACT(EPOCH FROM ("resetAt" - now())))::int, 1) AS "retryAfter"`;

const pgStore: Store = {
  async consume(items) {
    const { rows } = await getPool().query<StoreRow>(CONSUME_SQL, [
      items.map((i) => i.key),
      items.map((i) => i.windowSec),
      items.map((i) => i.inc),
    ]);
    return rows;
  },
  async refund(keys) {
    await getPool().query(
      `UPDATE "RateLimit" SET "count" = GREATEST("count" - 1, 0) WHERE "key" = ANY($1::text[]) AND "resetAt" > now()`,
      [keys],
    );
  },
  async cleanup() {
    await getPool().query(
      `DELETE FROM "RateLimit"
        WHERE "key" IN (SELECT "key" FROM "RateLimit" WHERE "resetAt" < now() - interval '10 minutes' LIMIT 1000)`,
    );
  },
};

let store: Store = pgStore;
/** Solo para pruebas: cambia el almacén (null = el de Neon). */
export function setRateLimitStoreForTests(s: Store | null) {
  store = s ?? pgStore;
}

/** Cada cuántas llamadas (en promedio) se limpian las filas vencidas: 1 de cada 100. */
let cleanupChance = 0.01;
export function setCleanupChanceForTests(p: number) {
  cleanupChance = p;
}

/* ------------------------------------------------------------------ */
/* Identidades                                                          */
/* ------------------------------------------------------------------ */

/** Huella HMAC (32 hex) de las partes: no reversible y distinta por despliegue (SESSION_SECRET). */
export function scope(...parts: string[]): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('Falta SESSION_SECRET en el archivo .env de arraigados-app (ver .env.example).');
  return createHmac('sha256', secret).update(`ratelimit-v1\0${parts.join('\0')}`).digest('hex').slice(0, 32);
}

/** Correo normalizado para usarlo como identidad (mayúsculas, espacios y formas Unicode no cambian la clave). */
export function normalizeIdentity(email: unknown): string {
  return String(email ?? '').normalize('NFKC').trim().toLowerCase().slice(0, 254);
}

function expandIPv6(ip: string): number[] | null {
  let s = ip.split('%')[0];
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const o = v4[1].split('.').map(Number);
    if (o.some((n) => n > 255)) return null;
    s = s.slice(0, -v4[1].length) + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

/**
 * IP del cliente según Netlify (`context.ip`), normalizada. IPv4-mapeada -> IPv4; IPv6 -> prefijo /64.
 * Devuelve 'sin-ip' si no hay una IP válida. Ignora por completo las cabeceras de la petición.
 */
export function clientIp(context: { ip?: unknown } | undefined | null): string {
  const raw = typeof context?.ip === 'string' ? context.ip.trim() : '';
  const kind = isIP(raw.split('%')[0]);
  if (kind === 4) return raw;
  if (kind === 6) {
    const g = expandIPv6(raw);
    if (!g) return 'sin-ip';
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
    return g.slice(0, 4).map((x) => x.toString(16)).join(':') + '::/64';
  }
  return 'sin-ip';
}

/** Identidad de la IP del cliente (huella). */
export const ipScope = (context: { ip?: unknown } | undefined | null) => scope('ip', clientIp(context));

/* ------------------------------------------------------------------ */
/* Núcleo                                                               */
/* ------------------------------------------------------------------ */

function merge(hits: Hit[]): Required<Hit>[] {
  const byKey = new Map<string, Required<Hit>>();
  for (const h of hits) {
    const key = `${h.rule.name}:${h.id}`;
    const prev = byKey.get(key);
    if (prev) prev.inc += h.inc ?? 1;
    else byKey.set(key, { rule: h.rule, id: h.id, inc: h.inc ?? 1 });
  }
  return [...byKey.values()];
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('el almacén de límites tardó demasiado')), storeTimeoutMs);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

let lastMissingTableLog = 0;
function logStoreError(err: unknown) {
  if ((err as { code?: string } | null)?.code === '42P01') {
    // Throttled: una línea por minuto por instancia.
    if (Date.now() - lastMissingTableLog > 60_000) {
      lastMissingTableLog = Date.now();
      console.error('[ratelimit] la tabla "RateLimit" no existe: aplica migrations/011_rate_limit.sql. Mientras tanto NO se limita nada.');
    }
    return;
  }
  console.error('[ratelimit] fallo del almacén:', err instanceof Error ? err.message : String(err));
}

const isMissingTable = (err: unknown) => (err as { code?: string } | null)?.code === '42P01';

const waitText = (s: number) => (s < 60 ? `${s} s` : `${Math.ceil(s / 60)} min`);

/** 429 con el formato de error de la API + Retry-After y cabeceras informativas. */
export function tooManyRequests(rule: Rule, retryAfter: number): Response {
  const wait = Math.max(1, Math.ceil(retryAfter));
  return json(
    { error: `${rule.message ?? 'Demasiadas solicitudes.'} Espera ${waitText(wait)} e inténtalo de nuevo.`, code: 'rate_limited' },
    429,
    {
      'retry-after': String(wait),
      'ratelimit-limit': String(rule.max),
      'ratelimit-remaining': '0',
      'ratelimit-reset': String(wait),
      'ratelimit-policy': `${rule.max};w=${rule.windowSec}`,
    },
  );
}

function unavailable(): Response {
  return json({ error: 'Servicio temporalmente no disponible. Intenta de nuevo en unos segundos.', code: 'rate_limit_unavailable' }, 503, {
    'retry-after': '5',
  });
}

/**
 * Gasta cuota y decide. Devuelve null si la petición puede seguir, o la Response lista para regresar (429 / 503).
 * Cuenta SIEMPRE (también las bloqueadas) pero la ventana nunca se extiende: pasada `resetAt` se recupera sola.
 */
export async function guard(hits: Hit[]): Promise<Response | null> {
  const items = merge(hits);
  if (!items.length) return null;
  let rows: StoreRow[];
  try {
    rows = await withTimeout(
      store.consume(items.map((h) => ({ key: `${h.rule.name}:${h.id}`, windowSec: h.rule.windowSec, inc: h.inc }))),
    );
  } catch (err) {
    logStoreError(err);
    if (isMissingTable(err)) return null;
    return items.some((h) => h.rule.onFail === 'closed') ? unavailable() : null;
  }
  if (cleanupChance > 0 && Math.random() < cleanupChance) void store.cleanup().catch(() => {});

  const byKey = new Map(rows.map((r) => [r.key, r]));
  let worst: { rule: Rule; retryAfter: number } | null = null;
  for (const h of items) {
    const row = byKey.get(`${h.rule.name}:${h.id}`);
    if (!row) continue;
    // inc > 0: bloquea al pasar el máximo. inc = 0 (solo consulta): bloquea al llegar al máximo.
    const blocked = h.inc > 0 ? row.count > h.rule.max : row.count >= h.rule.max;
    if (blocked && (!worst || row.retryAfter > worst.retryAfter)) worst = { rule: h.rule, retryAfter: row.retryAfter };
  }
  return worst ? tooManyRequests(worst.rule, worst.retryAfter) : null;
}

/** Suma uso sin decidir (p. ej. contar un fallo DESPUÉS de ver el resultado). Nunca lanza. */
export async function record(hits: Hit[]): Promise<void> {
  const items = merge(hits).filter((h) => h.inc > 0);
  if (!items.length) return;
  try {
    await withTimeout(store.consume(items.map((h) => ({ key: `${h.rule.name}:${h.id}`, windowSec: h.rule.windowSec, inc: h.inc }))));
  } catch (err) {
    logStoreError(err);
  }
}

/** Devuelve 1 de cuota (p. ej. al iniciar sesión con éxito). Nunca lanza. */
export async function refund(hits: Hit[]): Promise<void> {
  const keys = merge(hits).map((h) => `${h.rule.name}:${h.id}`);
  if (!keys.length) return;
  try {
    await withTimeout(store.refund(keys));
  } catch (err) {
    logStoreError(err);
  }
}

/* ------------------------------------------------------------------ */
/* Atajos por tipo de actor                                             */
/* ------------------------------------------------------------------ */

/** Staff/Admin: límite por cuenta (id de la sesión ya verificada). */
export function guardUser(rule: Rule, userId: string, ...extra: Hit[]) {
  return guard([{ rule, id: scope(userId) }, ...extra]);
}

/**
 * Rutas del asistente (x-pulse-token): límite por pulsera + consulta del contador de tokens inválidos de la IP.
 * Un token con formato inválido no gasta nada (la ruta responde 401 sin tocar la base). Si la ruta responde 401
 * con un token de formato válido (inexistente / sin sesión), se cuenta un fallo contra la IP.
 */
export async function withAttendeeLimit(
  req: Request,
  context: { ip?: unknown } | undefined,
  rule: Rule,
  run: () => Promise<Response>,
): Promise<Response> {
  const token = req.headers.get('x-pulse-token') ?? '';
  if (!QR_TOKEN_RE.test(token)) return run();
  const ip = ipScope(context);
  const blocked = await guard([
    { rule, id: scope('tok', token) },
    { rule: RULES.bad_token_ip, id: ip, inc: 0 },
  ]);
  if (blocked) return blocked;
  const res = await run();
  if (res.status === 401) await record([{ rule: RULES.bad_token_ip, id: ip }]);
  return res;
}
