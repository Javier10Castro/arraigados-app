import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import type pg from 'pg';
import { assertSafeTestDatabase, resetTestDatabase } from './testdb.mts';
import { guard, record, setCleanupChanceForTests, setRateLimitStoreForTests, type Rule } from '../../server/rateLimit';
import { setPhotoStoreForTests, setProfileCooldownForTests } from '../../server/profile';
import loginFn from '../../netlify/functions/auth-login.mts';
import authMeFn from '../../netlify/functions/auth-me.mts';
import claimFn from '../../netlify/functions/claim.mts';
import pulseFn from '../../netlify/functions/pulse.mts';
import meFn from '../../netlify/functions/me.mts';
import notesFn from '../../netlify/functions/notes.mts';
import profileFn from '../../netlify/functions/profile.mts';
import profilesFn from '../../netlify/functions/profiles.mts';
import redeemFn from '../../netlify/functions/staff-redeem.mts';
import staffPulseFn from '../../netlify/functions/staff-pulse.mts';
import staffSearchFn from '../../netlify/functions/staff-search.mts';
import staffReassignFn from '../../netlify/functions/staff-reassign.mts';
import adminUsersFn from '../../netlify/functions/admin-users.mts';
import adminDishSearchFn from '../../netlify/functions/admin-dish-image-search.mts';
import adminAuditFn from '../../netlify/functions/admin-audit.mts';
import adminBatchesFn from '../../netlify/functions/admin-batches.mts';
import adminAttendeesFn from '../../netlify/functions/admin-attendees.mts';
import adminAttendeeProfileFn from '../../netlify/functions/admin-attendee-profile.mts';

/**
 * Integración del límite de frecuencia contra una base PostgreSQL DESECHABLE (ver scripts/test-ratelimit.mjs).
 * Invoca las Netlify Functions REALES directamente (sin red), con el mismo contrato (Request, Context{ip, params}).
 * Servicios externos (Neon, Netlify Blobs, Openverse) NO se usan: el almacén de fotos es en memoria.
 */
const TEST_URL = process.env.TEST_DATABASE_URL;
const skip = TEST_URL ? false : 'TEST_DATABASE_URL no definida (ver encabezado de scripts/test-ratelimit.mjs)';

const ADMIN = { email: 'admin@test.local', password: 'Admin-pass-1' };
const STAFF1 = { email: 'staff1@test.local', password: 'Staff-pass-1' };
const STAFF2 = { email: 'staff2@test.local', password: 'Staff-pass-2' };
const SECRETS = [ADMIN.password, STAFF1.password, STAFF2.password, 'clave-incorrecta'];
const TOK = {
  me: ['AAAAAAAAAAAAAA01', 'AAAAAAAAAAAAAA02', 'AAAAAAAAAAAAAA03', 'AAAAAAAAAAAAAA04', 'AAAAAAAAAAAAAA05', 'AAAAAAAAAAAAAA06'],
  unclaimed: ['UUUUUUUUUUUUUU01', 'UUUUUUUUUUUUUU02', 'UUUUUUUUUUUUUU03', 'UUUUUUUUUUUUUU04'],
  redeem3: 'RRRRRRRRRRRRRR03',
  redeem100: 'RRRRRRRRRRRRR100',
};
const CODE = { redeem3: 'AR26-R3R3R', redeem100: 'AR26-R9R9R', other: 'AR26-ZZZZZ' };

let admin: pg.Client;
let adminCookie = '';
let staff1Cookie = '';
let staff2Cookie = '';
const logs: string[] = [];
const origLog = { error: console.error, log: console.log, warn: console.warn };

const q = <T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values: unknown[] = []) => admin.query<T>(text, values);
const rows = async (text: string, values: unknown[] = []) => (await q(text, values)).rows;
const count = async (table: string, where = 'true') => Number((await rows(`SELECT count(*)::int AS n FROM "${table}" WHERE ${where}`))[0].n);
const clearLimits = () => q('DELETE FROM "RateLimit"');

type Opts = { ip?: string; headers?: Record<string, string>; json?: unknown; form?: FormData; cookie?: string; token?: string; params?: Record<string, string>; raw?: string };
let ipSeq = 0;
/** Una IP de documentación (RFC 5737) distinta por prueba, para no mezclar contadores. */
const freshIp = () => `198.51.100.${(++ipSeq % 250) + 1}`;

async function call(fn: (req: Request, ctx: any) => Promise<Response>, method: string, url: string, o: Opts = {}) {
  const headers: Record<string, string> = { ...(o.headers ?? {}) };
  if (o.cookie) headers.cookie = o.cookie;
  if (o.token) headers['x-pulse-token'] = o.token;
  let body: BodyInit | undefined;
  if (o.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(o.json);
  } else if (o.raw !== undefined) {
    headers['content-type'] = 'application/json';
    body = o.raw;
  } else if (o.form) body = o.form;
  const req = new Request(`http://localhost${url}`, { method, headers, body });
  return fn(req, { ip: o.ip ?? '203.0.113.1', params: o.params ?? {} });
}

const login = (creds: { email: string; password: string }, o: Opts = {}) => call(loginFn, 'POST', '/api/auth/login', { ...o, json: creds });
const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0];
const bodyOf = async (res: Response) => (await res.json()) as any;
const rlKeys = async (prefix: string) => (await rows(`SELECT "key" FROM "RateLimit" WHERE "key" LIKE $1`, [`${prefix}:%`])).length;
const rlCount = async (prefix: string) => Number((await rows(`SELECT COALESCE(sum("count"),0)::int AS n FROM "RateLimit" WHERE "key" LIKE $1`, [`${prefix}:%`]))[0].n);

const photos = new Map<string, Uint8Array>();
let ok_jpg: Buffer;

describe('límite de frecuencia · integración (PostgreSQL real)', { skip }, () => {
  before(async () => {
    const url = assertSafeTestDatabase(TEST_URL);
    process.env.DATABASE_URL = url.toString();
    process.env.SESSION_SECRET = 'integration-secret-integration-secret-123';
    for (const k of ['error', 'log', 'warn'] as const) console[k] = (...a: unknown[]) => void logs.push(a.map(String).join(' '));
    admin = await resetTestDatabase(url);
    ok_jpg = fs.readFileSync(path.resolve('tests/rate-limit/fixtures/ok.jpg'));
    setPhotoStoreForTests({
      async set(k: string, d: Uint8Array) {
        photos.set(k, d);
      },
      async get(k: string) {
        const d = photos.get(k);
        return d ? { data: d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) as ArrayBuffer, contentType: 'image/jpeg' } : null;
      },
      async delete(k: string) {
        photos.delete(k);
      },
    } as any);
    setProfileCooldownForTests({ photoSec: 0, otherSec: 0 });

    const h = (p: string) => bcrypt.hashSync(p, 4);
    await q(`INSERT INTO "Zone"(id,name) VALUES ('z1','Zona 1')`);
    await q(`INSERT INTO "Presbytery"(id,name,"zoneId") VALUES ('p1','Presbiterio Uno','z1')`);
    await q(`INSERT INTO "Church"(id,name,"presbyteryId") VALUES ('c1','Iglesia Uno','p1')`);
    await q(`INSERT INTO "Package"(id,name,price,"includedDrinks") VALUES ('k3','Kit 3',10000,3),('k100','Kit 100',10000,100)`);
    await q(
      `INSERT INTO "User"(id,email,name,role,active,"passwordHash") VALUES
       ('u_admin',$1,'Admin Prueba','ADMIN',true,$4),('u_s1',$2,'Staff Uno','STAFF',true,$5),('u_s2',$3,'Staff Dos','STAFF',true,$6)`,
      [ADMIN.email, STAFF1.email, STAFF2.email, h(ADMIN.password), h(STAFF1.password), h(STAFF2.password)],
    );
    let n = 0;
    const active = async (id: string, token: string, code: string, pkg: string, name: string) => {
      await q(`INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","createdAt","updatedAt") VALUES ($1,$2,'19-21','c1',now(),now())`, [`a_${id}`, name]);
      await q(`INSERT INTO "Pulse"(id,"qrToken",status,"attendeeId","manualCode","packageId") VALUES ($1,$2,'ACTIVE',$3,$4,$5)`, [`p_${id}`, token, `a_${id}`, code, pkg]);
    };
    for (const t of TOK.me) await active(`me${++n}`, t, `AR26-AB${n + 1}CD`, 'k3', `Asistente ${n}`);
    await active('r3', TOK.redeem3, CODE.redeem3, 'k3', 'Canje Tres');
    await active('r100', TOK.redeem100, CODE.redeem100, 'k100', 'Canje Cien');
    for (const [i, t] of TOK.unclaimed.entries()) await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId") VALUES ($1,$2,'UNCLAIMED',$3,'k3')`, [`p_u${i}`, t, `AR26-UN${i + 2}UN`]);

    adminCookie = cookieOf(await login(ADMIN, { ip: '203.0.113.200' }));
    staff1Cookie = cookieOf(await login(STAFF1, { ip: '203.0.113.201' }));
    staff2Cookie = cookieOf(await login(STAFF2, { ip: '203.0.113.202' }));
    assert.ok(adminCookie && staff1Cookie && staff2Cookie, 'las sesiones de prueba se abrieron');
  });

  after(async () => {
    Object.assign(console, origLog);
    setRateLimitStoreForTests(null);
    await admin?.end();
  });

  beforeEach(async () => {
    setRateLimitStoreForTests(null);
    setCleanupChanceForTests(0);
    await clearLimits();
  });

  /* ---------------------------------------------------------------- */
  describe('almacén en PostgreSQL', () => {
    const rule: Rule = { name: 'it_rule', max: 40, windowSec: 60, onFail: 'open' };

    it('100 solicitudes simultáneas: exactamente 40 pasan, 60 reciben 429 y no se pierde ninguna cuenta', async () => {
      const res = await Promise.all(Array.from({ length: 100 }, () => guard([{ rule, id: 'conc' }])));
      assert.equal(res.filter((r) => r === null).length, 40);
      assert.equal(res.filter((r) => r?.status === 429).length, 60);
      assert.equal((await rows(`SELECT "count" FROM "RateLimit" WHERE "key"='it_rule:conc'`))[0].count, 100);
    });

    it('varias claves por sentencia en distinto orden desde muchas conexiones: sin interbloqueos ni errores', async () => {
      const ids = ['k1', 'k2', 'k3', 'k4'];
      const jobs = Array.from({ length: 80 }, (_, i) => {
        const order = i % 2 ? [...ids].reverse() : ids;
        return guard(order.map((id) => ({ rule: { ...rule, max: 1000 }, id })));
      });
      const res = await Promise.all(jobs);
      assert.ok(res.every((r) => r === null));
      assert.ok(logs.every((l) => !/deadlock|fallo del almacén/i.test(l)));
      assert.equal(await rlCount('it_rule'), 80 * 4);
    });

    it('al vencer la ventana el contador vuelve a 1 y Retry-After es positivo', async () => {
      const r = { ...rule, max: 1, name: 'it_win' };
      await guard([{ rule: r, id: 'w' }]);
      const blocked = await guard([{ rule: r, id: 'w' }]);
      assert.equal(blocked?.status, 429);
      const ra = Number(blocked!.headers.get('retry-after'));
      assert.ok(ra >= 1 && ra <= 60, `Retry-After=${ra}`);
      await q(`UPDATE "RateLimit" SET "resetAt" = now() - interval '1 second' WHERE "key"='it_win:w'`);
      assert.equal(await guard([{ rule: r, id: 'w' }]), null);
      assert.equal((await rows(`SELECT "count" FROM "RateLimit" WHERE "key"='it_win:w'`))[0].count, 1);
    });

    it('record + consulta (inc 0) y refund contra la base real', async () => {
      const r = { ...rule, max: 2, name: 'it_rec' };
      assert.equal(await guard([{ rule: r, id: 'x', inc: 0 }]), null);
      await record([{ rule: r, id: 'x' }]);
      await record([{ rule: r, id: 'x' }]);
      assert.equal((await guard([{ rule: r, id: 'x', inc: 0 }]))?.status, 429);
      const { refund } = await import('../../server/rateLimit');
      await refund([{ rule: r, id: 'x' }]);
      assert.equal(await guard([{ rule: r, id: 'x', inc: 0 }]), null);
      for (let i = 0; i < 5; i++) await refund([{ rule: r, id: 'x' }]);
      assert.equal((await rows(`SELECT "count" FROM "RateLimit" WHERE "key"='it_rec:x'`))[0].count, 0);
    });

    it('limpieza: borra lo vencido hace más de 10 min y conserva lo vigente y lo recién vencido', async () => {
      await q(`INSERT INTO "RateLimit"("key","count","resetAt") VALUES ('old:1',1,now()-interval '1 hour'),('recent:1',1,now()-interval '1 minute'),('live:1',1,now()+interval '1 minute')`);
      setCleanupChanceForTests(1);
      await guard([{ rule, id: 'trigger' }]);
      for (let i = 0; i < 20 && (await rlKeys('old')) > 0; i++) await new Promise((r) => setTimeout(r, 50));
      assert.equal(await rlKeys('old'), 0);
      assert.equal(await rlKeys('recent'), 1);
      assert.equal(await rlKeys('live'), 1);
    });

    it('tabla inexistente (migración 011 sin aplicar): el login sigue funcionando y se avisa en el log', async () => {
      await q(`ALTER TABLE "RateLimit" RENAME TO "RateLimit_off"`);
      try {
        logs.length = 0;
        const res = await login(ADMIN, { ip: freshIp() });
        assert.equal(res.status, 200);
        assert.ok(logs.some((l) => l.includes('[ratelimit] la tabla "RateLimit" no existe')));
      } finally {
        await q(`ALTER TABLE "RateLimit_off" RENAME TO "RateLimit"`);
      }
    });

    it('almacén caído (error de conexión): login y canje fallan cerrado (503 + Retry-After); una lectura sigue', async () => {
      setRateLimitStoreForTests({
        consume: async () => {
          throw new Error('Neon no responde (simulado)');
        },
        refund: async () => {},
        cleanup: async () => {},
      });
      const l = await login(ADMIN, { ip: freshIp() });
      assert.equal(l.status, 503);
      assert.equal(l.headers.get('retry-after'), '5');
      assert.equal((await bodyOf(l)).code, 'rate_limit_unavailable');
      const before = await count('Redemption');
      const r = await call(redeemFn, 'POST', '/api/staff/redeem', { cookie: staff1Cookie, json: { manualCode: CODE.redeem100, idempotencyKey: 'caido-0001-key' } });
      // authorize() es regla "open" (staff_base) -> pasa; el canje es "closed" -> 503 y NO descuenta.
      assert.equal(r.status, 503);
      assert.equal(await count('Redemption'), before);
      const m = await call(meFn, 'GET', '/api/me', { token: TOK.me[0] });
      assert.equal(m.status, 200, 'las lecturas del asistente (regla open) siguen funcionando');
    });
  });

  /* ---------------------------------------------------------------- */
  describe('login', () => {
    it('cuenta existente e inexistente: mismas respuestas (401 y 429) y mismo umbral; no se revela nada', async () => {
      const ip = freshIp();
      const real: Response[] = [];
      const fake: Response[] = [];
      for (let i = 0; i < 6; i++) real.push(await login({ email: ADMIN.email, password: 'clave-incorrecta' }, { ip }));
      for (let i = 0; i < 6; i++) fake.push(await login({ email: 'no-existe@test.local', password: 'clave-incorrecta' }, { ip }));
      assert.deepEqual(real.map((r) => r.status), [401, 401, 401, 401, 401, 429]);
      assert.deepEqual(fake.map((r) => r.status), [401, 401, 401, 401, 401, 429]);
      assert.deepEqual(await bodyOf(real[0]), await bodyOf(fake[0]));
      const a = await bodyOf(real[5]);
      const b = await bodyOf(fake[5]);
      assert.deepEqual(a, b);
      assert.equal(a.code, 'rate_limited');
      assert.match(a.error, /^Demasiados intentos de inicio de sesión\. Espera 15 min e inténtalo de nuevo\.$/);
      assert.equal(real[5].headers.get('retry-after'), fake[5].headers.get('retry-after'));
      assert.ok(Number(real[5].headers.get('retry-after')) <= 900);
    });

    it('bloqueada la pareja correo+IP, ni siquiera la contraseña correcta entra desde esa IP; otra IP y otras cuentas sí', async () => {
      const ip = freshIp();
      for (let i = 0; i < 5; i++) await login({ email: ADMIN.email, password: 'clave-incorrecta' }, { ip });
      assert.equal((await login(ADMIN, { ip })).status, 429, 'sin bypass con la contraseña correcta');
      assert.equal((await login(ADMIN, { ip: freshIp() })).status, 200, 'otra IP: la pareja es distinta (el atacante no bloquea a la víctima en su propia IP)');
      assert.equal((await login(STAFF1, { ip })).status, 200, 'otra cuenta desde la misma IP');
    });

    it('cabeceras falsificadas (X-Forwarded-For, x-nf-client-connection-ip...) no evaden ni causan bloqueos', async () => {
      const ip = freshIp();
      const out: number[] = [];
      for (let i = 0; i < 7; i++) {
        const spoof = { 'x-forwarded-for': `10.0.0.${i}`, 'x-nf-client-connection-ip': `10.9.9.${i}`, 'x-real-ip': `172.16.0.${i}`, forwarded: `for=192.0.2.${i}` };
        out.push((await login({ email: ADMIN.email, password: 'clave-incorrecta' }, { ip, headers: spoof })).status);
      }
      assert.deepEqual(out, [401, 401, 401, 401, 401, 429, 429]);
      // Falsificar la IP de OTRA persona tampoco lo bloquea a él.
      const victimIp = freshIp();
      for (let i = 0; i < 8; i++) await login({ email: ADMIN.email, password: 'x' }, { ip: freshIp(), headers: { 'x-forwarded-for': victimIp } });
      assert.equal((await login(STAFF1, { ip: victimIp })).status, 200);
    });

    it('mayúsculas, espacios y formas Unicode del correo comparten el mismo contador', async () => {
      const ip = freshIp();
      const variants = [ADMIN.email, ADMIN.email.toUpperCase(), `  ${ADMIN.email}  `, 'ＡＤＭＩＮ@test.local', ADMIN.email, ADMIN.email];
      const st: number[] = [];
      for (const email of variants) st.push((await login({ email, password: 'clave-incorrecta' }, { ip })).status);
      assert.equal(st[5], 429, JSON.stringify(st));
      assert.ok(st.slice(0, 5).every((s) => s === 401));
    });

    it('un inicio de sesión correcto devuelve su intento: 4 fallos + 1 éxito dejan el contador en 4', async () => {
      const ip = freshIp();
      for (let i = 0; i < 4; i++) await login({ email: STAFF2.email, password: 'clave-incorrecta' }, { ip });
      assert.equal((await login(STAFF2, { ip })).status, 200);
      assert.equal(await rlCount('login_pair'), 4);
      assert.equal(await rlCount('login_ip'), 4);
      assert.equal(await rlCount('login_id'), 4);
    });

    it('una IP probando 41 cuentas distintas: la 41.ª recibe 429 (login_ip)', async () => {
      const ip = freshIp();
      const st: number[] = [];
      for (let i = 0; i < 41; i++) st.push((await login({ email: `spray${i}@test.local`, password: 'clave-incorrecta' }, { ip })).status);
      assert.equal(st.filter((s) => s === 401).length, 40);
      assert.equal(st[40], 429);
    });

    it('una cuenta atacada desde 21 IP distintas: la 21.ª recibe 429 (login_id)', async () => {
      const st: number[] = [];
      for (let i = 0; i < 21; i++) st.push((await login({ email: STAFF1.email, password: 'clave-incorrecta' }, { ip: freshIp() })).status);
      assert.equal(st.filter((s) => s === 401).length, 20);
      assert.equal(st[20], 429);
    });

    it('20 intentos incorrectos SIMULTÁNEOS: solo 5 llegan a comprobar la contraseña', async () => {
      const ip = freshIp();
      const res = await Promise.all(Array.from({ length: 20 }, () => login({ email: ADMIN.email, password: 'clave-incorrecta' }, { ip })));
      assert.equal(res.filter((r) => r.status === 401).length, 5);
      assert.equal(res.filter((r) => r.status === 429).length, 15);
    });

    it('JSON inválido -> 400 sin gastar cuota; al vencer la ventana el acceso se recupera solo', async () => {
      const ip = freshIp();
      assert.equal((await call(loginFn, 'POST', '/api/auth/login', { ip, raw: '{no es json' })).status, 400);
      assert.equal(await rlKeys('login_pair'), 0);
      for (let i = 0; i < 6; i++) await login({ email: ADMIN.email, password: 'clave-incorrecta' }, { ip });
      assert.equal((await login(ADMIN, { ip })).status, 429);
      await q(`UPDATE "RateLimit" SET "resetAt" = now() - interval '1 second'`);
      assert.equal((await login(ADMIN, { ip })).status, 200);
    });
  });

  /* ---------------------------------------------------------------- */
  describe('registro y consulta de pulseras (públicas)', () => {
    const claimBody = (token: string) => ({ token, fullName: 'Persona de Prueba', ageRange: '19-21', churchId: 'c1' });

    it('reclamar una pulsera funciona; repetir -> already_active; 5 reclamos simultáneos -> exactamente 1 Attendee', async () => {
      const before = await count('Attendee');
      const res = await Promise.all(
        Array.from({ length: 5 }, () => call(claimFn, 'POST', '/api/claim', { ip: freshIp(), json: claimBody(TOK.unclaimed[0]) })),
      );
      const outcomes = await Promise.all(res.map(async (r) => (await bodyOf(r)).outcome));
      assert.equal(outcomes.filter((o) => o === 'claimed').length, 1, outcomes.join());
      assert.ok(outcomes.every((o) => o === 'claimed' || o === 'already_active'));
      assert.equal(await count('Attendee'), before + 1);
    });

    it('reintentos sobre la misma pulsera: 15 permitidos; el 16.º -> 429', async () => {
      const ip = freshIp();
      const st: number[] = [];
      for (let i = 0; i < 16; i++) st.push((await call(claimFn, 'POST', '/api/claim', { ip, json: { ...claimBody(TOK.unclaimed[1]), fullName: 'x' } })).status);
      assert.deepEqual([...new Set(st.slice(0, 15))], [400]);
      assert.equal(st[15], 429);
    });

    it('adivinar pulseras: 200 inexistentes desde una IP -> luego 429 (claim y pulse); otra IP no se ve afectada', async () => {
      const ip = freshIp();
      const rand = (i: number) => `Z${String(i).padStart(15, '0')}`;
      for (let i = 0; i < 200; i++) {
        const r = await call(pulseFn, 'GET', `/api/pulse/${rand(i)}`, { ip, params: { token: rand(i) } });
        assert.equal(r.status, 200, `solicitud ${i}`);
      }
      const blockedPulse = await call(pulseFn, 'GET', `/api/pulse/${rand(999)}`, { ip, params: { token: rand(999) } });
      assert.equal(blockedPulse.status, 429);
      assert.equal((await call(claimFn, 'POST', '/api/claim', { ip, json: claimBody(rand(5)) })).status, 429);
      const other = await call(pulseFn, 'GET', `/api/pulse/${rand(999)}`, { ip: freshIp(), params: { token: rand(999) } });
      assert.equal(other.status, 200);
      assert.equal((await bodyOf(other)).status, 'not_found');
    });

    it('escanear pulseras VÁLIDAS nunca consume el cupo de fallos (el recinto comparte IP): 250 consultas -> 250 respuestas 200', async () => {
      const ip = freshIp();
      let okCount = 0;
      for (let i = 0; i < 250; i++) {
        const t = TOK.me[i % TOK.me.length];
        const r = await call(pulseFn, 'GET', `/api/pulse/${t}`, { ip, params: { token: t } });
        if (r.status === 200 && (await bodyOf(r)).status === 'active') okCount++;
      }
      assert.equal(okCount, 250);
    });
  });

  /* ---------------------------------------------------------------- */
  describe('asistente (x-pulse-token)', () => {
    it('/api/me: 60 por minuto por pulsera; la 61.ª -> 429 con Retry-After; otra pulsera de la MISMA IP sigue bien', async () => {
      const ip = freshIp();
      const st: number[] = [];
      for (let i = 0; i < 61; i++) st.push((await call(meFn, 'GET', '/api/me', { ip, token: TOK.me[0] })).status);
      assert.equal(st.filter((s) => s === 200).length, 60);
      assert.equal(st[60], 429);
      const blocked = await call(meFn, 'GET', '/api/me', { ip, token: TOK.me[0] });
      assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
      assert.equal((await bodyOf(blocked)).code, 'rate_limited');
      assert.equal((await call(meFn, 'GET', '/api/me', { ip, token: TOK.me[1] })).status, 200);
    });

    it('recinto con una sola IP: 6 asistentes × 40 solicitudes desde la misma IP -> todas 200', async () => {
      const ip = freshIp();
      const all = await Promise.all(TOK.me.flatMap((t) => Array.from({ length: 40 }, () => call(meFn, 'GET', '/api/me', { ip, token: t }))));
      assert.ok(all.every((r) => r.status === 200));
    });

    it('token con formato inválido: 401 y NO se crea ninguna fila; token bien formado inexistente: 401 y cuenta un fallo de la IP', async () => {
      const ip = freshIp();
      for (const bad of ['corto', 'con espacios!!!!!!', 'x'.repeat(40)]) {
        assert.equal((await call(meFn, 'GET', '/api/me', { ip, token: bad })).status, 401);
      }
      assert.equal(await count('RateLimit'), 0);
      assert.equal((await call(meFn, 'GET', '/api/me', { ip, token: 'NoExisteNoExiste' })).status, 401);
      assert.equal(await rlCount('bad_token_ip'), 1);
      // Cabeceras de IP falsificadas: sigue siendo UNA sola clave de IP.
      await call(meFn, 'GET', '/api/me', { ip, token: 'NoExisteNoExist2', headers: { 'x-forwarded-for': '8.8.8.8', 'x-nf-client-connection-ip': '9.9.9.9' } });
      assert.equal(await rlKeys('bad_token_ip'), 1);
      assert.equal(await rlCount('bad_token_ip'), 2);
    });

    it('notas: 10 escrituras / 10 min; la 11.ª -> 429, pero leer "mis notas" sigue funcionando (otro cubo)', async () => {
      const ip = freshIp();
      const st: number[] = [];
      for (let i = 0; i < 11; i++) st.push((await call(notesFn, 'POST', '/api/notes', { ip, token: TOK.me[2], json: { text: `hola ${i}` } })).status);
      assert.equal(st.filter((s) => s === 200).length, 10, st.join());
      assert.equal(st[10], 429);
      assert.equal((await call(notesFn, 'GET', '/api/notes', { ip, token: TOK.me[2] })).status, 200);
    });

    it('directorio de perfiles: 30 por minuto por pulsera; el staff entra por su propio cupo', async () => {
      const ip = freshIp();
      const st: number[] = [];
      for (let i = 0; i < 31; i++) st.push((await call(profilesFn, 'POST', '/api/profiles', { ip, token: TOK.me[3], json: { ids: [] } })).status);
      assert.equal(st.filter((s) => s === 200).length, 30);
      assert.equal(st[30], 429);
      assert.equal((await call(profilesFn, 'POST', '/api/profiles', { ip, cookie: staff1Cookie, json: { ids: [] } })).status, 200);
    });

    it('foto de perfil: 5 subidas / 10 min; la 6.ª -> 429 SIN subir nada; cambiar a avatar y el borrado del Admin siguen', async () => {
      const ip = freshIp();
      const token = TOK.me[4];
      const upload = () => {
        const f = new FormData();
        f.set('kind', 'photo');
        f.set('photo', new File([ok_jpg], 'a.jpg', { type: 'image/jpeg' }));
        return call(profileFn, 'PUT', '/api/profile', { ip, token, form: f });
      };
      const st: number[] = [];
      for (let i = 0; i < 5; i++) st.push((await upload()).status);
      assert.deepEqual(st, [200, 200, 200, 200, 200]);
      const keyBefore = (await rows(`SELECT "photoKey" FROM "AttendeeProfile" WHERE "attendeeId" = 'a_me5'`))[0].photoKey;
      const filesBefore = photos.size;
      const sixth = await upload();
      assert.equal(sixth.status, 429);
      assert.equal((await bodyOf(sixth)).code, 'rate_limited');
      assert.ok(Number(sixth.headers.get('retry-after')) >= 1);
      assert.equal(photos.size, filesBefore, 'no se guardó ningún archivo nuevo');
      assert.equal((await rows(`SELECT "photoKey" FROM "AttendeeProfile" WHERE "attendeeId" = 'a_me5'`))[0].photoKey, keyBefore);
      const f = new FormData();
      f.set('kind', 'avatar');
      f.set('avatarId', 'a01');
      assert.equal((await call(profileFn, 'PUT', '/api/profile', { ip, token, form: f })).status, 200, 'sin foto no usa el cupo de fotos');
      const del = await call(adminAttendeeProfileFn, 'DELETE', '/api/admin/attendees/a_me5/profile-photo', { cookie: adminCookie, params: { id: 'a_me5' } });
      assert.equal(del.status, 200, 'la moderación del Admin no depende del cupo del asistente');
      assert.equal(photos.size, 0);
    });
  });

  /* ---------------------------------------------------------------- */
  describe('Staff y Admin (cookie)', () => {
    const redeem = (cookie: string, code: string, key: string, ip = freshIp()) =>
      call(redeemFn, 'POST', '/api/staff/redeem', { ip, cookie, json: { manualCode: code, idempotencyKey: key } });

    it('sin sesión (401) o sin rol (403) NO se gasta cuota: primero se autentica y autoriza', async () => {
      assert.equal((await call(redeemFn, 'POST', '/api/staff/redeem', { json: { manualCode: CODE.redeem3, idempotencyKey: 'sinsesion-001' } })).status, 401);
      assert.equal((await call(adminUsersFn, 'POST', '/api/admin/users', { cookie: staff1Cookie, json: {} })).status, 403);
      assert.equal((await call(adminDishSearchFn, 'POST', '/api/admin/dish-image-search', { cookie: staff1Cookie, json: { query: '' } })).status, 403);
      assert.equal(await count('RateLimit'), 0);
    });

    it('tope general por cuenta: 600 / min; la 601.ª -> 429; otra cuenta no se ve afectada', async () => {
      const st: number[] = [];
      for (let i = 0; i < 601; i++) st.push((await call(authMeFn, 'GET', '/api/auth/me', { cookie: staff1Cookie })).status);
      assert.equal(st.filter((s) => s === 200).length, 600);
      assert.equal(st[600], 429);
      assert.equal((await call(authMeFn, 'GET', '/api/auth/me', { cookie: staff2Cookie })).status, 200);
    });

    it('canje: la MISMA idempotencyKey enviada 10 veces a la vez descuenta UNA sola vez', async () => {
      const before = (await rows(`SELECT "drinksUsed" FROM "Pulse" WHERE "qrToken"=$1`, [TOK.redeem100]))[0].drinksUsed;
      const res = await Promise.all(Array.from({ length: 10 }, () => redeem(staff1Cookie, CODE.redeem100, 'misma-llave-0001')));
      const out = await Promise.all(res.map(async (r) => (await bodyOf(r)).outcome));
      assert.equal(out.filter((o) => o === 'ok').length, 1, out.join());
      assert.ok(out.every((o) => o === 'ok' || o === 'already_processed'));
      assert.equal((await rows(`SELECT "drinksUsed" FROM "Pulse" WHERE "qrToken"=$1`, [TOK.redeem100]))[0].drinksUsed, before + 1);
      assert.equal(await count('Redemption', `"idempotencyKey" = 'misma-llave-0001'`), 1);
    });

    it('canje: 10 simultáneos con saldo 3 -> exactamente 3 descuentos (el límite no sustituye la lógica transaccional)', async () => {
      await q(`UPDATE "Pulse" SET "drinksUsed" = 0 WHERE "qrToken" = $1`, [TOK.redeem3]);
      await q(`DELETE FROM "Redemption" WHERE "pulseId" = 'p_r3'`);
      const res = await Promise.all(Array.from({ length: 10 }, (_, i) => redeem(i % 2 ? staff1Cookie : staff2Cookie, CODE.redeem3, `paralelo-${i}-key`)));
      const out = await Promise.all(res.map(async (r) => (await bodyOf(r)).outcome));
      assert.equal(out.filter((o) => o === 'ok').length, 3, out.join());
      assert.equal(out.filter((o) => o === 'insufficient_balance').length, 7);
      assert.equal((await rows(`SELECT "drinksUsed" FROM "Pulse" WHERE "qrToken"=$1`, [TOK.redeem3]))[0].drinksUsed, 3);
      assert.equal(await count('Redemption', `"pulseId" = 'p_r3'`), 3);
    });

    it('canje: tope por pulsera 15 / min; el 16.º -> 429 y la base NO cambia', async () => {
      await q(`UPDATE "Pulse" SET "drinksUsed" = 0 WHERE "qrToken" = $1`, [TOK.redeem100]);
      await q(`DELETE FROM "Redemption" WHERE "pulseId" = 'p_r100'`);
      const st: number[] = [];
      for (let i = 0; i < 16; i++) st.push((await redeem(staff2Cookie, CODE.redeem100, `tope-${i}-llave`)).status);
      assert.equal(st.filter((s) => s === 200).length, 15);
      assert.equal(st[15], 429);
      assert.equal((await rows(`SELECT "drinksUsed" FROM "Pulse" WHERE "qrToken"=$1`, [TOK.redeem100]))[0].drinksUsed, 15);
      assert.equal(await count('Redemption', `"pulseId" = 'p_r100'`), 15);
    });

    it('búsqueda: 120 / min por cuenta; la 121.ª -> 429', async () => {
      const st: number[] = [];
      for (let i = 0; i < 121; i++) st.push((await call(staffSearchFn, 'GET', '/api/staff/search?q=asis', { cookie: staff1Cookie })).status);
      assert.equal(st.filter((s) => s === 200).length, 120);
      assert.equal(st[120], 429);
    });

    it('códigos manuales inexistentes: 40 / 10 min por cuenta; el 41.º -> 429; los válidos no cuentan', async () => {
      for (let i = 0; i < 10; i++) {
        const r = await call(staffPulseFn, 'GET', `/api/staff/pulse?code=${CODE.redeem3}`, { cookie: staff1Cookie });
        assert.equal((await bodyOf(r)).status, 'active');
      }
      assert.equal(await rlCount('staff_miss'), 0);
      const st: number[] = [];
      for (let i = 0; i < 41; i++) st.push((await call(staffPulseFn, 'GET', `/api/staff/pulse?code=${CODE.other}`, { cookie: staff1Cookie })).status);
      assert.equal(st.filter((s) => s === 200).length, 40);
      assert.equal(st[40], 429);
      assert.equal((await call(staffPulseFn, 'GET', `/api/staff/pulse?code=${CODE.other}`, { cookie: staff2Cookie })).status, 200);
    });

    it('reemplazo de pulsera: 20 / 10 min por cuenta', async () => {
      const st: number[] = [];
      for (let i = 0; i < 21; i++) st.push((await call(staffReassignFn, 'POST', '/api/staff/reassign', { cookie: staff1Cookie, json: { manualCode: CODE.other, newToken: 'nada' } })).status);
      assert.equal(st.filter((s) => s === 200).length, 20);
      assert.equal(st[20], 429);
    });

    it('Admin: búsqueda de imagen (servicio externo) 30 / 10 min; crear cuentas 20 / 10 min; bitácora 20 / 10 min', async () => {
      const dish: number[] = [];
      for (let i = 0; i < 31; i++) dish.push((await call(adminDishSearchFn, 'POST', '/api/admin/dish-image-search', { cookie: adminCookie, json: { query: '' } })).status);
      assert.equal(dish.filter((s) => s === 400).length, 30, dish.join());
      assert.equal(dish[30], 429);

      const users = await count('User');
      const mk: number[] = [];
      for (let i = 0; i < 21; i++) mk.push((await call(adminUsersFn, 'POST', '/api/admin/users', { cookie: adminCookie, json: {} })).status);
      assert.equal(mk.filter((s) => s === 400).length, 20, mk.join());
      assert.equal(mk[20], 429);
      assert.equal(await count('User'), users, 'ningún usuario se creó');

      const au: number[] = [];
      for (let i = 0; i < 21; i++) au.push((await call(adminAuditFn, 'DELETE', '/api/admin/audit', { cookie: adminCookie, json: { confirm: 'no' } })).status);
      assert.equal(au[20], 429, au.join());
      assert.ok(au.slice(0, 20).every((s) => s === 400 || s === 403));
    });

    it('regresión: las rutas de lectura del Admin siguen respondiendo 200 con su sesión', async () => {
      for (const [fn, url] of [
        [adminUsersFn, '/api/admin/users'],
        [adminBatchesFn, '/api/admin/batches'],
        [adminAttendeesFn, '/api/admin/attendees'],
        [adminAuditFn, '/api/admin/audit'],
      ] as const) {
        const r = await call(fn as any, 'GET', url, { cookie: adminCookie });
        assert.equal(r.status, 200, `${url} -> ${r.status}`);
      }
    });
  });

  /* ---------------------------------------------------------------- */
  describe('privacidad de los contadores y de los logs', () => {
    it('las claves guardadas son "regla:huella-hex" y nunca contienen correos, IP, tokens ni contraseñas', async () => {
      const ip = '198.51.100.250';
      await login({ email: 'Privado@Test.local', password: 'clave-incorrecta' }, { ip });
      await call(meFn, 'GET', '/api/me', { ip, token: TOK.me[5] });
      await call(meFn, 'GET', '/api/me', { ip, token: 'NoExisteNoExiste' });
      await call(claimFn, 'POST', '/api/claim', { ip, json: { token: TOK.unclaimed[2], fullName: 'x', ageRange: '19-21', churchId: 'c1' } });
      const keys = (await rows(`SELECT "key" FROM "RateLimit"`)).map((r) => r.key as string);
      assert.ok(keys.length >= 6);
      for (const k of keys) {
        assert.match(k, /^[a-z_0-9]+:[0-9a-f]{32}$/, k);
        for (const secret of ['privado', '198.51.100', TOK.me[5], TOK.unclaimed[2], 'NoExiste', 'clave-incorrecta']) assert.ok(!k.toLowerCase().includes(secret.toLowerCase()), `${k} contiene ${secret}`);
      }
    });

    it('en toda la corrida ningún log contiene contraseñas, cookies, tokens de pulsera ni URLs firmadas', () => {
      const text = logs.join('\n');
      for (const secret of [...SECRETS, ...TOK.me, ...TOK.unclaimed, TOK.redeem3, TOK.redeem100, 'arr_staff=', '&s=', 'integration-secret']) {
        assert.ok(!text.includes(secret), `un log contiene "${secret}"`);
      }
    });
  });
});
