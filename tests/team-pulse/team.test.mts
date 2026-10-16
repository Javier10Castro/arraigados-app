import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import type pg from 'pg';
import { assertSafeTestDatabase, resetTeamDatabase, applyMigration, MIGRATION_012 } from './testdb.mts';
import { setRateLimitStoreForTests } from '../../server/rateLimit';
import loginFn from '../../netlify/functions/auth-login.mts';
import redeemFn from '../../netlify/functions/staff-redeem.mts';
import staffPulseFn from '../../netlify/functions/staff-pulse.mts';
import staffMeFn from '../../netlify/functions/staff-me.mts';
import adminStaffPulseFn from '../../netlify/functions/admin-staff-pulse.mts';
import adminSelfFn from '../../netlify/functions/admin-selfredeem.mts';
import voidFn from '../../netlify/functions/admin-redemption-void.mts';
import redemptionsFn from '../../netlify/functions/admin-redemptions.mts';
import dashboardFn from '../../netlify/functions/admin-dashboard.mts';
import claimFn from '../../netlify/functions/claim.mts';
import pulseFn from '../../netlify/functions/pulse.mts';
import { listBatches, getBatch } from '../../server/batches';
import meFn from '../../netlify/functions/me.mts';
import notesFeedFn from '../../netlify/functions/notes-feed.mts';
import notesLikeFn from '../../netlify/functions/notes-like.mts';
import { resetPassword, updateUser, UserError } from '../../server/users';
import { getDashboard, parseFilters } from '../../server/dashboard';
import { reassignPulse, lookupPulse, redeemOne } from '../../server/staff';

/**
 * Pulseras de equipo + autocanje contra PostgreSQL DESECHABLE (scripts/test-team.mjs).
 * Invoca las Netlify Functions REALES (sin red). Nunca usa Neon.
 */
const TEST_URL = process.env.TEST_DATABASE_URL;
const skip = TEST_URL ? false : 'TEST_DATABASE_URL no definida';

const OWNER = { email: 'javiercastro9912@gmail.com', password: 'Owner-pass-1' };
const ADMIN2 = { email: 'admin2@test.local', password: 'Admin2-pass-1' };
const STAFF1 = { email: 'staff1@test.local', password: 'Staff-pass-1' };
const STAFF2 = { email: 'staff2@test.local', password: 'Staff-pass-2' };

let db: pg.Client;
const cookies: Record<string, string> = {};
const q = (t: string, v: unknown[] = []) => db.query(t, v);
const rows = async (t: string, v: unknown[] = []) => (await q(t, v)).rows;
const one = async (t: string, v: unknown[] = []) => (await rows(t, v))[0];
const n = async (t: string, v: unknown[] = []) => Number((await rows(t, v))[0].n);

let ipSeq = 0;
async function call(fn: (r: Request, c: any) => Promise<Response>, method: string, url: string, o: { cookie?: string; json?: unknown; token?: string; params?: Record<string, string> } = {}) {
  const headers: Record<string, string> = {};
  if (o.cookie) headers.cookie = o.cookie;
  if (o.token) headers['x-pulse-token'] = o.token;
  let body: string | undefined;
  if (o.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(o.json);
  }
  return fn(new Request(`http://localhost${url}`, { method, headers, body }), { ip: `198.51.100.${(++ipSeq % 250) + 1}`, params: o.params ?? {} });
}
const J = async (r: Response) => (await r.json()) as any;
const cookieOf = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0];

const link = (as: string, userId: string, code: string) => call(adminStaffPulseFn, 'POST', '/api/admin/staff-pulse', { cookie: cookies[as], json: { userId, code } });
const redeem = (as: string, code: string, key: string) => call(redeemFn, 'POST', '/api/staff/redeem', { cookie: cookies[as], json: { manualCode: code, idempotencyKey: `idem-${key}` } });
const setGlobal = (as: string, role: string, allowed: boolean) => call(adminSelfFn, 'PATCH', '/api/admin/selfredeem', { cookie: cookies[as], json: { scope: 'global', role, allowed } });
const setUser = (as: string, userId: string, mode: string) => call(adminSelfFn, 'PATCH', '/api/admin/selfredeem', { cookie: cookies[as], json: { scope: 'user', userId, mode } });

// Pulseras de prueba (qrToken de 16 alfanuméricos, códigos AR26-XXXXX)
const P = (i: number) => ({ id: `tp${i}`, token: `TTTTTTTTTTTTTT${String(i).padStart(2, '0')}`, code: `AR26-T${i + 1}T${i + 1}T` });

async function newPulse(i: number, pkg = 'k3', status = 'UNCLAIMED') {
  const p = P(i);
  await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","batchId","updatedAt") VALUES ($1,$2,$3,$4,$5,'b_base',now())`, [p.id, p.token, status, p.code, pkg]);
  return p;
}
async function redeemCount(where = 'true') {
  return n(`SELECT count(*)::int AS n FROM "Redemption" WHERE ${where}`);
}

describe('pulseras de equipo y autocanje · PostgreSQL real', { skip }, () => {
  before(async () => {
    const url = assertSafeTestDatabase(TEST_URL);
    process.env.DATABASE_URL = url.toString();
    process.env.SESSION_SECRET = 'integration-secret-integration-secret-123';
    delete process.env.OWNER_EMAIL;
    for (const k of ['error', 'log', 'warn'] as const) console[k] = () => {};
    db = await resetTeamDatabase(url);
    if (process.env.TEST_WITHOUT_011 === '1') assert.equal((await one(`SELECT to_regclass('"RateLimit"')::text AS t`)).t, null, 'sin 011 no debe existir RateLimit');
    const h = (p: string) => bcrypt.hashSync(p, 4);
    await q(`INSERT INTO "Zone"(id,name) VALUES ('z1','Zona 1')`);
    await q(`INSERT INTO "Presbytery"(id,name,"zoneId") VALUES ('p1','Presbiterio','z1')`);
    await q(`INSERT INTO "Church"(id,name,"presbyteryId") VALUES ('c1','Iglesia','p1')`);
    await q(`INSERT INTO "Package"(id,name,price,"includedDrinks","updatedAt") VALUES ('k3','Kit 3',10000,3,now()),('k0','Kit 0',5000,0,now()),('kB','Kit B',10000,3,now())`);
    await q(
      `INSERT INTO "User"(id,email,name,role,active,"passwordHash","updatedAt") VALUES
       ('u_owner',$1,'Dueño','ADMIN',true,$5,now()),('u_admin2',$2,'Admin Dos','ADMIN',true,$6,now()),('u_s1',$3,'Staff Uno','STAFF',true,$7,now()),('u_s2',$4,'Staff Dos','STAFF',true,$8,now())`,
      [OWNER.email, ADMIN2.email, STAFF1.email, STAFF2.email, h(OWNER.password), h(ADMIN2.password), h(STAFF1.password), h(STAFF2.password)],
    );
    // En Neon "Pulse"."batchId" es NOT NULL: toda pulsera de prueba cuelga de un lote.
    await q(`INSERT INTO "Batch"(id,code,"packageId",quantity,"createdById") VALUES ('b_base','LOTE-BASE','k3',0,'u_owner')`);
    for (const [k, c] of [['owner', OWNER], ['admin2', ADMIN2], ['s1', STAFF1], ['s2', STAFF2]] as const) {
      const r = await call(loginFn, 'POST', '/api/auth/login', { json: c });
      cookies[k] = cookieOf(r);
      assert.ok(cookies[k], `login ${k}`);
    }
  });
  after(async () => {
    setRateLimitStoreForTests(null);
    await db?.end();
  });
  beforeEach(async () => {
    setRateLimitStoreForTests(null);
    if (process.env.TEST_WITHOUT_011 !== '1') await q(`DELETE FROM "RateLimit"`);
    // db-limpiar-pruebas (más abajo) borra lotes de prueba: el lote base debe existir siempre (batchId es NOT NULL en Neon).
    await q(`INSERT INTO "Batch"(id,code,"packageId",quantity,"createdById") SELECT 'b_base','LOTE-BASE','k3',0,'u_owner' WHERE EXISTS (SELECT 1 FROM "User" WHERE id='u_owner') ON CONFLICT (id) DO NOTHING`);
    await q(`DELETE FROM "Redemption"`);
    await q(`DELETE FROM "StaffPulse"`);
    await q(`DELETE FROM "SelfRedeemOverride"`);
    await q(`UPDATE "SelfRedeemSetting" SET allowed=false`);
    await q(`DELETE FROM "Pulse" WHERE id LIKE 'tp%' OR id LIKE 'ap%'`);
    await q(`DELETE FROM "Attendee" WHERE id LIKE 'at%'`);
    await q(`DELETE FROM "AuditLog"`);
  });

  /* ------------------------------------------------------------ vinculación */
  describe('vincular pulsera (solo Admin)', () => {
    it('Admin vincula: pulsera ACTIVE sin asistente, StaffPulse vigente, sin Attendee creado, con auditoría', async () => {
      const p = await newPulse(1);
      const before = await n(`SELECT count(*)::int AS n FROM "Attendee"`);
      const r = await call(adminStaffPulseFn, 'POST', '/api/admin/staff-pulse', { cookie: cookies.admin2, json: { userId: 'u_s1', code: p.code } });
      assert.equal(r.status, 200);
      assert.equal((await J(r)).outcome, 'ok');
      const pu = await one(`SELECT status::text AS status, "attendeeId", "drinksUsed" FROM "Pulse" WHERE id=$1`, [p.id]);
      assert.deepEqual(pu, { status: 'ACTIVE', attendeeId: null, drinksUsed: 0 });
      assert.equal(await n(`SELECT count(*)::int AS n FROM "StaffPulse" WHERE "userId"='u_s1' AND "unlinkedAt" IS NULL`), 1);
      assert.equal(await n(`SELECT count(*)::int AS n FROM "Attendee"`), before);
      const a = await one(`SELECT action, "actorId", metadata::text AS m FROM "AuditLog" WHERE action='staffpulse.link'`);
      assert.equal(a.actorId, 'u_admin2');
      assert.ok(!a.m.includes(p.token), 'la auditoría no guarda el token del QR');
    });
    it('Staff NO puede vincular, desvincular ni consultar (403); sin sesión 401', async () => {
      const p = await newPulse(1);
      assert.equal((await link('s1', 'u_s1', p.code)).status, 403);
      assert.equal((await call(adminStaffPulseFn, 'DELETE', '/api/admin/staff-pulse?userId=u_s1', { cookie: cookies.s1 })).status, 403);
      assert.equal((await call(adminStaffPulseFn, 'GET', '/api/admin/staff-pulse?userId=u_s1', { cookie: cookies.s1 })).status, 403);
      assert.equal((await call(adminStaffPulseFn, 'POST', '/api/admin/staff-pulse', { json: { userId: 'u_s1', code: p.code } })).status, 401);
      assert.equal(await n(`SELECT count(*)::int AS n FROM "StaffPulse"`), 0);
    });
    it('el actor sale de la sesión: un userId/actor falso en el cuerpo no cambia quién audita', async () => {
      const p = await newPulse(1);
      await call(adminStaffPulseFn, 'POST', '/api/admin/staff-pulse', { cookie: cookies.admin2, json: { userId: 'u_s1', code: p.code, actorId: 'u_owner', linkedById: 'u_owner' } });
      assert.equal((await one(`SELECT "linkedById" FROM "StaffPulse"`)).linkedById, 'u_admin2');
    });
    it('no se puede vincular una pulsera de un asistente (ACTIVE con attendeeId): nada cambia', async () => {
      await q(`INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","updatedAt") VALUES ('at1','Asistente Uno','19-21','c1',now())`);
      await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","attendeeId","drinksUsed","batchId","updatedAt") VALUES ('ap1','AAAAAAAAAAAAAA01','ACTIVE','AR26-AAAAA','k3','at1',1,'b_base',now())`);
      const r = await J(await link('admin2', 'u_s1', 'AR26-AAAAA'));
      assert.equal(r.outcome, 'pulse_in_use');
      const pu = await one(`SELECT "attendeeId","drinksUsed" FROM "Pulse" WHERE id='ap1'`);
      assert.deepEqual(pu, { attendeeId: 'at1', drinksUsed: 1 });
      assert.equal(await n(`SELECT count(*)::int AS n FROM "StaffPulse"`), 0);
    });
    it('defensa de la base: un INSERT directo de StaffPulse sobre pulsera de asistente falla (trigger)', async () => {
      await q(`INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","updatedAt") VALUES ('at1','Asistente Uno','19-21','c1',now())`);
      await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","attendeeId","batchId","updatedAt") VALUES ('ap1','AAAAAAAAAAAAAA01','ACTIVE','AR26-AAAAA','k3','at1','b_base',now())`);
      await assert.rejects(q(`INSERT INTO "StaffPulse"(id,"userId","pulseId","createdAt") VALUES ('x','u_s1','ap1',now())`), /pertenece a un asistente/);
    });
    it('no se puede vincular una pulsera ya vinculada a otra cuenta, ni una inexistente o deshabilitada', async () => {
      const p = await newPulse(1);
      assert.equal((await J(await link('admin2', 'u_s1', p.code))).outcome, 'ok');
      assert.equal((await J(await link('admin2', 'u_s2', p.code))).outcome, 'pulse_linked');
      assert.equal((await J(await link('admin2', 'u_s2', 'AR26-NPQ22'))).outcome, 'pulse_not_found');
      const d = await newPulse(2, 'k3', 'INVALIDATED');
      assert.equal((await J(await link('admin2', 'u_s2', d.code))).outcome, 'pulse_invalidated');
      assert.equal(await n(`SELECT count(*)::int AS n FROM "StaffPulse" WHERE "unlinkedAt" IS NULL`), 1);
    });
    it('una cuenta no puede tener dos pulseras vigentes', async () => {
      const a = await newPulse(1);
      const b = await newPulse(2);
      assert.equal((await J(await link('admin2', 'u_s1', a.code))).outcome, 'ok');
      assert.equal((await J(await link('admin2', 'u_s1', b.code))).outcome, 'user_has_pulse');
      assert.equal((await one(`SELECT status::text AS s FROM "Pulse" WHERE id=$1`, [b.id])).s, 'UNCLAIMED');
    });
    it('concurrencia: dos Admin vinculan la MISMA pulsera a cuentas distintas -> gana una', async () => {
      const p = await newPulse(1);
      const [a, b] = await Promise.all([link('admin2', 'u_s1', p.code), link('owner', 'u_s2', p.code)]);
      const out = [(await J(a)).outcome, (await J(b)).outcome].sort();
      assert.deepEqual(out, ['ok', 'pulse_linked']);
      assert.equal(await n(`SELECT count(*)::int AS n FROM "StaffPulse" WHERE "unlinkedAt" IS NULL`), 1);
    });
    it('concurrencia: dos Admin vinculan pulseras DISTINTAS a la MISMA cuenta -> gana una', async () => {
      const a = await newPulse(1);
      const b = await newPulse(2);
      const res = await Promise.all([link('admin2', 'u_s1', a.code), link('owner', 'u_s1', b.code)]);
      const out = [(await J(res[0])).outcome, (await J(res[1])).outcome].sort();
      assert.deepEqual(out, ['ok', 'user_has_pulse']);
      assert.equal(await n(`SELECT count(*)::int AS n FROM "StaffPulse" WHERE "userId"='u_s1' AND "unlinkedAt" IS NULL`), 1);
      assert.equal(await n(`SELECT count(*)::int AS n FROM "Pulse" WHERE id IN ('tp1','tp2') AND status='ACTIVE'`), 1);
    });
    it('desvincular y reemplazar dejan historial y auditoría; el reemplazo exige el mismo kit', async () => {
      const a = await newPulse(1);
      const b = await newPulse(2);
      const c = await newPulse(3, 'kB');
      await link('admin2', 'u_s1', a.code);
      assert.equal((await J(await call(adminStaffPulseFn, 'PUT', '/api/admin/staff-pulse', { cookie: cookies.admin2, json: { userId: 'u_s1', code: c.code } }))).outcome, 'different_kit');
      assert.equal((await J(await call(adminStaffPulseFn, 'PUT', '/api/admin/staff-pulse', { cookie: cookies.admin2, json: { userId: 'u_s1', code: b.code } }))).outcome, 'ok');
      assert.equal((await one(`SELECT status::text AS s FROM "Pulse" WHERE id=$1`, [a.id])).s, 'INVALIDATED');
      assert.equal(await n(`SELECT count(*)::int AS n FROM "StaffPulse" WHERE "userId"='u_s1'`), 2);
      assert.equal(await n(`SELECT count(*)::int AS n FROM "StaffPulse" WHERE "userId"='u_s1' AND "unlinkedAt" IS NULL`), 1);
      assert.equal((await J(await call(adminStaffPulseFn, 'DELETE', '/api/admin/staff-pulse?userId=u_s1', { cookie: cookies.admin2 }))).outcome, 'ok');
      assert.equal((await J(await call(adminStaffPulseFn, 'DELETE', '/api/admin/staff-pulse?userId=u_s1', { cookie: cookies.admin2 }))).outcome, 'no_link');
      assert.ok((await n(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action IN ('staffpulse.link','staffpulse.replace','staffpulse.unlink')`)) >= 3);
    });
  });

  /* ------------------------------------------------------------ reclamo */
  describe('el registro normal no puede tomar una pulsera de equipo', () => {
    it('claim con el token de una pulsera de equipo -> team (no registrable), sin Attendee nuevo', async () => {
      const p = await newPulse(1);
      await link('admin2', 'u_s1', p.code);
      const before = await n(`SELECT count(*)::int AS n FROM "Attendee"`);
      const r = await J(await call(claimFn, 'POST', '/api/claim', { json: { token: p.token, fullName: 'Intruso Prueba', ageRange: '19-21', churchId: 'c1' } }));
      assert.equal(r.outcome, 'team');
      assert.equal(await n(`SELECT count(*)::int AS n FROM "Attendee"`), before);
      assert.equal((await one(`SELECT "attendeeId" FROM "Pulse" WHERE id=$1`, [p.id])).attendeeId, null);
    });
    it('el token de una pulsera de equipo no sirve como credencial de asistente (/api/me)', async () => {
      const p = await newPulse(1);
      await link('admin2', 'u_s1', p.code);
      const r = await call(meFn, 'GET', '/api/me', { token: p.token });
      assert.equal(r.status, 401);
    });
    it('defensa de la base: asignar attendeeId a una pulsera reservada falla (trigger)', async () => {
      const p = await newPulse(1);
      await link('admin2', 'u_s1', p.code);
      await q(`INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","updatedAt") VALUES ('at1','Asistente Uno','19-21','c1',now())`);
      await assert.rejects(q(`UPDATE "Pulse" SET "attendeeId"='at1' WHERE id=$1`, [p.id]), /reservada para una cuenta del equipo/);
    });
    it('reasignar (reemplazo de pulsera de asistente) no puede usar como destino una pulsera de equipo', async () => {
      const t = await newPulse(1);
      await link('admin2', 'u_s1', t.code);
      await q(`INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","updatedAt") VALUES ('at1','Asistente Uno','19-21','c1',now())`);
      await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","attendeeId","batchId","updatedAt") VALUES ('ap1','AAAAAAAAAAAAAA01','ACTIVE','AR26-AAAAA','k3','at1','b_base',now())`);
      const res: any = await reassignPulse('AR26-AAAAA', t.token, 'u_admin2').catch((e) => ({ error: String(e) }));
      assert.notEqual(res.outcome, 'ok');
      assert.equal((await one(`SELECT "attendeeId" FROM "Pulse" WHERE id=$1`, [t.id])).attendeeId, null);
      assert.equal((await one(`SELECT status::text AS s FROM "Pulse" WHERE id='ap1'`)).s, 'ACTIVE');
    });
  });

  /* ------------------------------------------------------------ autocanje */
  describe('autocanje: precedencia y permisos', () => {
    const setup = async () => {
      const p = await newPulse(1);
      await link('admin2', 'u_s1', p.code);
      return p;
    };
    const selfRedeemOutcome = async (as: string, code: string, key: string) => (await J(await redeem(as, code, key))).outcome;

    it('por defecto está DENEGADO (Staff y Admin) y no se descuenta nada', async () => {
      const p = await setup();
      assert.equal(await selfRedeemOutcome('s1', p.code, 'k-def-1'), 'self_redeem_not_allowed');
      const q2 = await newPulse(2);
      await link('owner', 'u_admin2', q2.code);
      assert.equal(await selfRedeemOutcome('admin2', q2.code, 'k-def-2'), 'self_redeem_not_allowed');
      assert.equal(await redeemCount(), 0);
      assert.equal((await one(`SELECT "drinksUsed" FROM "Pulse" WHERE id=$1`, [p.id])).drinksUsed, 0);
    });
    it('global Staff ON permite a Staff pero no a Admin; global OFF vuelve a denegar', async () => {
      const p = await setup();
      const q2 = await newPulse(2);
      await link('owner', 'u_admin2', q2.code);
      assert.equal((await setGlobal('admin2', 'STAFF', true)).status, 200);
      assert.equal(await selfRedeemOutcome('s1', p.code, 'k-g-1'), 'ok');
      assert.equal(await selfRedeemOutcome('admin2', q2.code, 'k-g-2'), 'self_redeem_not_allowed');
      await setGlobal('admin2', 'STAFF', false);
      assert.equal(await selfRedeemOutcome('s1', p.code, 'k-g-3'), 'self_redeem_not_allowed');
      assert.equal(await redeemCount(), 1);
    });
    it('global Admin ON permite a Admin', async () => {
      const q2 = await newPulse(2);
      await link('owner', 'u_admin2', q2.code);
      await setGlobal('owner', 'ADMIN', true);
      assert.equal(await selfRedeemOutcome('admin2', q2.code, 'k-a-1'), 'ok');
    });
    it('excepción ALLOW funciona con el global apagado; DENY bloquea con el global encendido', async () => {
      const p = await setup();
      assert.equal((await setUser('owner', 'u_s1', 'allow')).status, 200);
      assert.equal(await selfRedeemOutcome('s1', p.code, 'k-o-1'), 'ok');
      await setUser('owner', 'u_s1', 'deny');
      await setGlobal('admin2', 'STAFF', true);
      assert.equal(await selfRedeemOutcome('s1', p.code, 'k-o-2'), 'self_redeem_not_allowed');
      assert.equal(await redeemCount(), 1);
    });
    it('"heredar" borra la excepción; cambiar el global NO borra excepciones', async () => {
      await setup();
      await setUser('owner', 'u_s1', 'deny');
      await setGlobal('admin2', 'STAFF', true);
      await setGlobal('admin2', 'STAFF', false);
      await setGlobal('admin2', 'ADMIN', true);
      assert.equal(await n(`SELECT count(*)::int AS n FROM "SelfRedeemOverride" WHERE "userId"='u_s1' AND mode='deny'`), 1);
      await setUser('owner', 'u_s1', 'inherit');
      assert.equal(await n(`SELECT count(*)::int AS n FROM "SelfRedeemOverride"`), 0);
      await setGlobal('admin2', 'STAFF', true);
      const p = P(1);
      assert.equal(await selfRedeemOutcome('s1', p.code, 'k-i-1'), 'ok');
    });
    it('un Admin que no es el dueño NO puede cambiar excepciones (403) y no se escribe nada', async () => {
      await setup();
      const r = await setUser('admin2', 'u_s1', 'allow');
      assert.equal(r.status, 403);
      assert.equal(await n(`SELECT count(*)::int AS n FROM "SelfRedeemOverride"`), 0);
      assert.equal((await setUser('s1', 'u_s1', 'allow')).status, 403);
    });
    it('Staff y anónimo no pueden cambiar el global; datos inválidos se rechazan', async () => {
      assert.equal((await setGlobal('s1', 'STAFF', true)).status, 403);
      assert.equal((await call(adminSelfFn, 'PATCH', '/api/admin/selfredeem', { json: { scope: 'global', role: 'STAFF', allowed: true } })).status, 401);
      assert.equal((await setGlobal('admin2', 'OWNER', true)).status, 400);
      assert.equal((await setGlobal('admin2', 'STAFF', 'yes' as any)).status, 400);
      assert.equal((await setUser('owner', 'u_s1', 'maybe')).status, 400);
      assert.equal((await setUser('owner', 'u_nope', 'allow')).status, 404);
      assert.equal(await n(`SELECT count(*)::int AS n FROM "SelfRedeemSetting" WHERE allowed`), 0);
    });
    it('la vista de excepciones por persona solo se entrega al dueño; el Admin ve solo los interruptores', async () => {
      const o = await J(await call(adminSelfFn, 'GET', '/api/admin/selfredeem', { cookie: cookies.owner }));
      assert.equal(o.isOwner, true);
      assert.ok(Array.isArray(o.users) && o.users.length >= 4);
      const a = await J(await call(adminSelfFn, 'GET', '/api/admin/selfredeem', { cookie: cookies.admin2 }));
      assert.equal(a.isOwner, false);
      assert.equal(a.users, undefined);
    });
    it('los permisos viven en tablas propias y sobreviven a vaciar la bitácora', async () => {
      const p = await setup();
      await setUser('owner', 'u_s1', 'deny');
      await setGlobal('admin2', 'STAFF', true);
      assert.ok((await n(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action LIKE 'selfredeem.%'`)) >= 2);
      await q(`DELETE FROM "AuditLog"`);
      assert.equal(await selfRedeemOutcome('s1', p.code, 'k-w-1'), 'self_redeem_not_allowed');
    });
    it('si la tabla de permisos no existe o falla, se DENIEGA (cierra por defecto)', async () => {
      const p = await setup();
      await setGlobal('admin2', 'STAFF', true);
      await q(`ALTER TABLE "SelfRedeemSetting" RENAME TO "SelfRedeemSetting_x"`);
      try {
        assert.equal(await selfRedeemOutcome('s1', p.code, 'k-f-1'), 'self_redeem_not_allowed');
      } finally {
        await q(`ALTER TABLE "SelfRedeemSetting_x" RENAME TO "SelfRedeemSetting"`);
      }
      assert.equal(await redeemCount(), 0);
    });
  });

  /* ------------------------------------------------------------ canje en pulsera ajena / inválidos */
  describe('canje de pulseras de equipo por otra persona y casos inválidos', () => {
    it('otro miembro canjea la pulsera de un Staff aunque el autocanje esté apagado/denegado', async () => {
      const p = await newPulse(1);
      await link('admin2', 'u_s1', p.code);
      await setGlobal('admin2', 'STAFF', false);
      await setUser('owner', 'u_s1', 'deny');
      assert.equal((await J(await redeem('s2', p.code, 'k-x-1'))).outcome, 'ok');
      const r = await one(`SELECT "attendeeId","beneficiaryUserId","createdById" FROM "Redemption"`);
      assert.deepEqual(r, { attendeeId: null, beneficiaryUserId: 'u_s1', createdById: 'u_s2' });
    });
    it('"autocanje" se deriva (beneficiario = quien registra) y el interruptor de otra persona no cuenta', async () => {
      const p = await newPulse(1);
      await link('admin2', 'u_s1', p.code);
      await setUser('owner', 'u_s2', 'allow'); // permiso de OTRA persona: no da derecho sobre la pulsera de s1
      await setUser('owner', 'u_s1', 'allow');
      assert.equal((await J(await redeem('s1', p.code, 'k-d-1'))).outcome, 'ok');
      const r = await one(`SELECT "beneficiaryUserId"="createdById" AS self FROM "Redemption"`);
      assert.equal(r.self, true);
    });
    it('un Staff NO puede canjear la pulsera de otro Staff escondiéndose tras su propio permiso (el permiso solo aplica a la propia)', async () => {
      const p = await newPulse(1);
      await link('admin2', 'u_s1', p.code);
      await setUser('owner', 'u_s2', 'deny');
      // s2 canjea la de s1: es "otro miembro", permitido por el procedimiento normal
      assert.equal((await J(await redeem('s2', p.code, 'k-e-1'))).outcome, 'ok');
    });
    it('pulsera inexistente, sin vincular, deshabilitada o sin saldo no descuentan', async () => {
      assert.equal((await J(await redeem('s1', 'AR26-NPQ22', 'k-n-1'))).outcome, 'pulse_not_active');
      const u = await newPulse(1);
      assert.equal((await J(await redeem('s2', u.code, 'k-n-2'))).outcome, 'pulse_not_active');
      const i = await newPulse(2, 'k3', 'INVALIDATED');
      assert.equal((await J(await redeem('s2', i.code, 'k-n-3'))).outcome, 'pulse_not_active');
      const z = await newPulse(3, 'k0');
      await link('admin2', 'u_s2', z.code);
      assert.equal((await J(await redeem('s1', z.code, 'k-n-4'))).outcome, 'insufficient_balance');
      assert.equal(await redeemCount(), 0);
    });
    it('cuenta vinculada pero desactivada no canjea', async () => {
      const p = await newPulse(1);
      await link('admin2', 'u_s2', p.code);
      await q(`UPDATE "User" SET active=false WHERE id='u_s2'`);
      try {
        const out = (await J(await redeem('s1', p.code, 'k-in-1'))).outcome;
        assert.notEqual(out, 'ok');
        assert.equal(await redeemCount(), 0);
      } finally {
        await q(`UPDATE "User" SET active=true WHERE id='u_s2'`);
      }
    });
    it('idempotencia: la misma llave repetida no descuenta dos veces (autocanje y ajeno)', async () => {
      const p = await newPulse(1);
      await link('admin2', 'u_s1', p.code);
      await setUser('owner', 'u_s1', 'allow');
      const a = await J(await redeem('s1', p.code, 'k-idem-1'));
      const b = await J(await redeem('s1', p.code, 'k-idem-1'));
      assert.equal(a.outcome, 'ok');
      assert.equal(b.outcome, 'already_processed');
      assert.equal(await redeemCount(), 1);
      assert.equal((await one(`SELECT "drinksUsed" FROM "Pulse" WHERE id=$1`, [p.id])).drinksUsed, 1);
    });
    it('concurrencia: 10 canjes simultáneos con saldo 3 -> exactamente 3', async () => {
      const p = await newPulse(1);
      await link('admin2', 'u_s1', p.code);
      const res = await Promise.all(Array.from({ length: 10 }, (_, i) => redeem('s2', p.code, `k-c-${i}`)));
      const outs = (await Promise.all(res.map(J))).map((r) => r.outcome);
      assert.equal(outs.filter((o) => o === 'ok').length, 3);
      assert.equal(outs.filter((o) => o === 'insufficient_balance').length, 7);
      assert.equal((await one(`SELECT "drinksUsed" FROM "Pulse" WHERE id=$1`, [p.id])).drinksUsed, 3);
      assert.equal(await redeemCount(), 3);
    });
    it('carrera de autocanje: permiso apagado a la vez que se canjea -> nunca excede el saldo ni deja canjes sin permiso consistente', async () => {
      const p = await newPulse(1);
      await link('admin2', 'u_s1', p.code);
      await setGlobal('admin2', 'STAFF', true);
      const res = await Promise.all([
        ...Array.from({ length: 6 }, (_, i) => redeem('s1', p.code, `k-r-${i}`)),
        setGlobal('admin2', 'STAFF', false),
      ]);
      const ok = (await Promise.all(res.slice(0, 6).map(J))).filter((r) => r.outcome === 'ok').length;
      assert.ok(ok <= 3);
      assert.equal(await redeemCount(), ok);
      assert.equal((await one(`SELECT "drinksUsed" FROM "Pulse" WHERE id=$1`, [p.id])).drinksUsed, ok);
    });
  });

  /* ------------------------------------------------------------ asistentes sin cambios */
  describe('asistentes: flujo, historial, anulaciones y reportes sin cambios', () => {
    const attendeeWithPulse = async () => {
      await q(`INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","updatedAt") VALUES ('at1','Asistente Uno','19-21','c1',now())`);
      await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","attendeeId","claimedAt","batchId","updatedAt") VALUES ('ap1','AAAAAAAAAAAAAA01','ACTIVE','AR26-AAAAA','k3','at1',now(),'b_base',now())`);
    };
    it('canje normal de asistente: igual que antes (attendeeId, sin beneficiario de equipo)', async () => {
      await attendeeWithPulse();
      assert.equal((await J(await redeem('s1', 'AR26-AAAAA', 'k-at-1'))).outcome, 'ok');
      const r = await one(`SELECT "attendeeId","beneficiaryUserId" FROM "Redemption"`);
      assert.deepEqual(r, { attendeeId: 'at1', beneficiaryUserId: null });
      assert.equal((await one(`SELECT "drinksUsed" FROM "Pulse" WHERE id='ap1'`)).drinksUsed, 1);
    });
    it('el Staff con autocanje permitido no puede usarlo sobre pulsera de ASISTENTE ni de otra persona', async () => {
      await attendeeWithPulse();
      await setGlobal('admin2', 'STAFF', true);
      assert.equal((await J(await redeem('s1', 'AR26-AAAAA', 'k-at-2'))).outcome, 'ok'); // es el procedimiento normal del staff
      const r = await one(`SELECT "createdById","beneficiaryUserId" FROM "Redemption"`);
      assert.equal(r.beneficiaryUserId, null);
    });
    it('anular canje de equipo devuelve el saldo a LA pulsera correcta (incluso tras reemplazo)', async () => {
      const a = await newPulse(1);
      const b = await newPulse(2);
      await link('admin2', 'u_s1', a.code);
      await redeem('s2', a.code, 'k-v-1');
      await redeem('s2', a.code, 'k-v-2');
      await call(adminStaffPulseFn, 'PUT', '/api/admin/staff-pulse', { cookie: cookies.admin2, json: { userId: 'u_s1', code: b.code } });
      const rid = (await one(`SELECT id FROM "Redemption" ORDER BY "createdAt" LIMIT 1`)).id;
      const v = await J(await call(voidFn, 'POST', `/api/admin/redemptions/${rid}/void`, { cookie: cookies.admin2, json: { reason: 'Prueba de anulación' }, params: { id: rid } }));
      assert.notEqual(v.outcome, 'not_found');
      const usedB = (await one(`SELECT "drinksUsed" FROM "Pulse" WHERE id=$1`, [b.id])).drinksUsed;
      const usedA = (await one(`SELECT "drinksUsed" FROM "Pulse" WHERE id=$1`, [a.id])).drinksUsed;
      assert.ok(usedA >= 0 && usedB >= 0);
      assert.equal(usedB, 1, 'la pulsera VIGENTE (la nueva) queda con 2 canjes - 1 anulado = 1');
      assert.equal(usedA, 2, 'la pulsera deshabilitada no se toca');
    });
    it('anular canje de asistente sigue funcionando', async () => {
      await attendeeWithPulse();
      await redeem('s1', 'AR26-AAAAA', 'k-av-1');
      const rid = (await one(`SELECT id FROM "Redemption"`)).id;
      await call(voidFn, 'POST', `/api/admin/redemptions/${rid}/void`, { cookie: cookies.admin2, json: { reason: 'Error de captura' }, params: { id: rid } });
      assert.equal((await one(`SELECT "drinksUsed" FROM "Pulse" WHERE id='ap1'`)).drinksUsed, 0);
    });
    it('el listado de canjes muestra los de equipo (rotulados) y los de asistentes', async () => {
      await attendeeWithPulse();
      const p = await newPulse(1);
      await link('admin2', 'u_s1', p.code);
      await redeem('s2', 'AR26-AAAAA', 'k-l-1');
      await redeem('s2', p.code, 'k-l-2');
      const list = await J(await call(redemptionsFn, 'GET', '/api/admin/redemptions', { cookie: cookies.admin2 }));
      const items: any[] = list.items ?? list.rows ?? [];
      assert.equal(items.length, 2);
      assert.equal(items.filter((r) => r.team).length, 1);
    });
    it('el tablero de asistentes NO cuenta el consumo ni las pulseras del equipo', async () => {
      await attendeeWithPulse();
      const f = parseFilters(new URLSearchParams());
      const base = JSON.stringify(await getDashboard(f));
      const p = await newPulse(1);
      await link('admin2', 'u_s1', p.code);
      await redeem('s2', p.code, 'k-dash-1');
      await redeem('s2', p.code, 'k-dash-2');
      const after = await getDashboard(f);
      const strip = (s: string) => s;
      void strip;
      const b = JSON.parse(base);
      delete (b as any).generatedAt;
      const a2 = JSON.parse(JSON.stringify(after));
      delete a2.generatedAt;
      assert.deepEqual(a2, b, 'los indicadores de asistentes no cambian por consumo/pulseras del equipo');
    });
    it('el endpoint del tablero responde con pulseras de equipo presentes', async () => {
      const p = await newPulse(1);
      await link('admin2', 'u_s1', p.code);
      await redeem('s2', p.code, 'k-dash-3');
      const r = await call(dashboardFn, 'GET', '/api/admin/dashboard', { cookie: cookies.admin2 });
      assert.equal(r.status, 200);
    });
  });

  /* ------------------------------------------------------------ cuenta propia (staff-me) */
  describe('/api/staff-me y la pulsera propia', () => {
    it('sin pulsera -> none; con pulsera -> active con saldo; sin sesión 401', async () => {
      assert.equal((await J(await call(staffMeFn, 'GET', '/api/staff-me', { cookie: cookies.s1 }))).state, 'none');
      const p = await newPulse(1);
      await link('admin2', 'u_s1', p.code);
      const r = await J(await call(staffMeFn, 'GET', '/api/staff-me', { cookie: cookies.s1 }));
      assert.equal(r.state, 'active');
      assert.equal(r.drinksRemaining, 3);
      assert.equal(r.selfRedeemAllowed, false);
      assert.equal((await call(staffMeFn, 'GET', '/api/staff-me')).status, 401);
    });
    it('cada cuenta solo ve SU pulsera (no acepta ids del cliente)', async () => {
      const p = await newPulse(1);
      await link('admin2', 'u_s1', p.code);
      const r = await J(await call(staffMeFn, 'GET', '/api/staff-me?userId=u_s1', { cookie: cookies.s2 }));
      assert.equal(r.state, 'none');
    });
    it('el lookup del escáner marca isSelf/selfRedeemAllowed solo para el dueño de la pulsera', async () => {
      const p = await newPulse(1);
      await link('admin2', 'u_s1', p.code);
      await setUser('owner', 'u_s1', 'allow');
      const mine = await J(await call(staffPulseFn, 'GET', `/api/staff/pulse?code=${p.code}`, { cookie: cookies.s1 }));
      const other = await J(await call(staffPulseFn, 'GET', `/api/staff/pulse?code=${p.code}`, { cookie: cookies.s2 }));
      assert.equal(mine.status, 'team');
      assert.equal(mine.isSelf, true);
      assert.equal(mine.selfRedeemAllowed, true);
      assert.equal(other.isSelf, false);
    });
  });

  /* ------------------------------------------------------------ cuenta propietaria */
  describe('protección de la cuenta propietaria', () => {
    it('otro Admin no puede restablecer su contraseña, desactivarla ni cambiarle el rol', async () => {
      await assert.rejects(resetPassword('u_admin2', 'u_owner', 'Temporal-123'), UserError);
      await assert.rejects(updateUser('u_admin2', 'u_owner', { active: false } as any), UserError);
      await assert.rejects(updateUser('u_admin2', 'u_owner', { role: 'STAFF' } as any), UserError);
      const o = await one(`SELECT role::text AS role, active FROM "User" WHERE id='u_owner'`);
      assert.deepEqual(o, { role: 'ADMIN', active: true });
    });
    const withOwnerEnv = async (value: string | undefined, fn: () => Promise<void>) => {
      const prev = process.env.OWNER_EMAIL;
      if (value === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = value;
      try { await fn(); } finally { if (prev === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = prev; }
    };
    const adminCannotTouchOwner = async () => {
      await assert.rejects(resetPassword('u_admin2', 'u_owner', 'Temporal-123'), UserError);
      await assert.rejects(updateUser('u_admin2', 'u_owner', { active: false } as any), UserError);
      await assert.rejects(updateUser('u_admin2', 'u_owner', { role: 'STAFF' } as any), UserError);
      assert.deepEqual(await one(`SELECT role::text AS role, active FROM "User" WHERE id='u_owner'`), { role: 'ADMIN', active: true });
      const r = await setUser('admin2', 'u_owner', 'deny');
      assert.equal(r.status, 403);
      assert.equal(await n(`SELECT count(*)::int AS n FROM "SelfRedeemOverride"`), 0);
    };
    it('OWNER_EMAIL sin definir: rige el propietario por defecto y está protegido', async () => {
      await withOwnerEnv(undefined, adminCannotTouchOwner);
    });
    it('OWNER_EMAIL igual al correo del propietario (con mayúsculas y espacios): protegido', async () => {
      await withOwnerEnv('  JavierCastro9912@Gmail.com ', adminCannotTouchOwner);
    });
    it('OWNER_EMAIL apuntando a OTRO correo: la cuenta real deja de estar protegida y nadie gestiona excepciones (comportamiento documentado)', async () => {
      await withOwnerEnv('otro.dueno@example.com', async () => {
        // Nadie de esta base coincide con el correo configurado -> ni el dueño real puede gestionar excepciones
        const r = await setUser('owner', 'u_s1', 'allow');
        assert.equal(r.status, 403);
        assert.equal(await n(`SELECT count(*)::int AS n FROM "SelfRedeemOverride"`), 0);
        // ...y otro Admin SÍ podría restablecer la contraseña de la cuenta real (riesgo de configuración, no de código)
        const original = (await one(`SELECT "passwordHash" FROM "User" WHERE id='u_owner'`)).passwordHash;
        try {
          await resetPassword('u_admin2', 'u_owner', 'Temporal-123');
          assert.notEqual((await one(`SELECT "passwordHash" FROM "User" WHERE id='u_owner'`)).passwordHash, original);
        } finally {
          await q(`UPDATE "User" SET "passwordHash"=$1 WHERE id='u_owner'`, [original]);
        }
      });
    });
    it('la cuenta propietaria sí puede editar a otros', async () => {
      await updateUser('u_owner', 'u_s2', { name: 'Staff Dos Editado' } as any);
      assert.equal((await one(`SELECT name FROM "User" WHERE id='u_s2'`)).name, 'Staff Dos Editado');
      await updateUser('u_owner', 'u_s2', { name: 'Staff Dos' } as any);
    });
  });


  /* ------------------------------------------------------------ limpieza de pruebas */
  describe('db-limpiar-pruebas no borra asignaciones del equipo por accidente', () => {
    const run = (args: string[], input = '') =>
      spawnSync('node', ['scripts/db-limpiar-pruebas.mjs', ...args], {
        env: { ...process.env, DATABASE_URL: TEST_URL!, NODE_NO_WARNINGS: '1' },
        input,
        encoding: 'utf8',
        timeout: 60_000,
      });
    /** Responde a cada pregunta cuando aparece (ask() abre una interfaz nueva por pregunta: no sirve mandar todo junto). */
    const runInteractive = (args: string[], answers: Record<string, string>) =>
      new Promise<{ status: number | null; out: string }>((resolve) => {
        const child = spawn('node', ['scripts/db-limpiar-pruebas.mjs', ...args], {
          env: { ...process.env, DATABASE_URL: TEST_URL!, NODE_NO_WARNINGS: '1' },
        });
        let out = '';
        const done = new Set<string>();
        const onData = (d: Buffer) => {
          out += d.toString();
          for (const [needle, reply] of Object.entries(answers)) {
            if (!done.has(needle) && out.includes(needle)) {
              done.add(needle);
              child.stdin.write(reply + '\n');
            }
          }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        const t = setTimeout(() => child.kill(), 50_000);
        child.on('close', (code) => {
          clearTimeout(t);
          resolve({ status: code, out });
        });
      });

    const seed = async () => {
      const p = await newPulse(1);
      await link('admin2', 'u_s1', p.code);
      await redeem('s2', p.code, 'k-clean-1');
    };
    const team = () => n(`SELECT count(*)::int AS n FROM "StaffPulse"`);

    it('por defecto SE DETIENE sin respaldar ni borrar nada', async () => {
      await seed();
      const r = run([], 'LIMPIAR TODO\n');
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /asignada\(s\) a cuentas del equipo/);
      assert.equal(await team(), 1);
      assert.equal(await redeemCount(), 1);
      assert.equal(await n(`SELECT count(*)::int AS n FROM "Pulse" WHERE id='tp1'`), 1);
    });
    it('--simular tampoco borra y avisa del bloqueo', async () => {
      await seed();
      const r = run(['--simular']);
      assert.notEqual(r.status, 0);
      assert.equal(await team(), 1);
    });
    it('--incluir-equipo con SOLO la primera confirmación cancela y no borra', async () => {
      await seed();
      const r = await runInteractive(['--incluir-equipo'], { 'Escribe LIMPIAR TODO': 'LIMPIAR TODO', 'Segunda confirmación': 'no' });
      assert.equal(r.status, 0, r.out);
      assert.match(r.out, /Cancelado/);
      assert.equal(await team(), 1);
      assert.equal(await redeemCount(), 1);
    });
    it('opciones desconocidas se rechazan', async () => {
      const r = run(['--todo']);
      assert.notEqual(r.status, 0);
    });
    it('--incluir-equipo con ambas confirmaciones borra las asignaciones, las pulseras y los canjes de prueba', async () => {
      await seed();
      const r = await runInteractive(['--incluir-equipo'], { 'Escribe LIMPIAR TODO': 'LIMPIAR TODO', 'Segunda confirmación': 'BORRAR ASIGNACIONES DEL EQUIPO' });
      assert.equal(r.status, 0, r.out);
      assert.equal(await team(), 0);
      assert.equal(await n(`SELECT count(*)::int AS n FROM "Pulse"`), 0);
      assert.equal(await redeemCount(), 0);
      // la configuración de autocanje y las cuentas se conservan
      assert.equal(await n(`SELECT count(*)::int AS n FROM "SelfRedeemSetting"`), 2);
      assert.equal(await n(`SELECT count(*)::int AS n FROM "User"`), 4);
    });
  });

  /* ------------------------------------------------------------ «Vincular pulsera» (sidebar) */
  describe('«Vincular pulsera»: estado desde el servidor y vinculación propia del Admin', () => {
    const me = async (as: string) => J(await call(staffMeFn, 'GET', '/api/staff-me', { cookie: cookies[as] }));
    const selfLink = (as: string, userId: string, code: string) => link(as, userId, code);
    const linksOf = (userId: string) => n(`SELECT count(*)::int AS n FROM "StaffPulse" WHERE "userId"=$1 AND "unlinkedAt" IS NULL`, [userId]);

    it('Staff sin pulsera: estado pendiente (none); Staff NO puede autoasignarse (403) y nada cambia', async () => {
      const p = await newPulse(1);
      assert.equal((await me('s1')).state, 'none');
      const r = await selfLink('s1', 'u_s1', p.code);
      assert.equal(r.status, 403);
      assert.equal(await linksOf('u_s1'), 0);
      assert.equal((await one(`SELECT status::text AS s, "attendeeId" FROM "Pulse" WHERE id=$1`, [p.id])).s, 'UNCLAIMED');
      assert.equal((await me('s1')).state, 'none');
    });
    it('Admin se vincula su propia pulsera; el estado persiste tras cerrar sesión y volver a entrar', async () => {
      const p = await newPulse(1);
      assert.equal((await me('admin2')).state, 'none');
      const r = await J(await selfLink('admin2', 'u_admin2', p.code));
      assert.equal(r.outcome, 'ok');
      assert.equal((await me('admin2')).state, 'active');
      // Sesión nueva (otro "dispositivo"): el estado viene de la base, no de la sesión anterior
      const again = await call(loginFn, 'POST', '/api/auth/login', { json: ADMIN2 });
      const fresh = cookieOf(again);
      const m = await J(await call(staffMeFn, 'GET', '/api/staff-me', { cookie: fresh }));
      assert.equal(m.state, 'active');
      assert.equal(m.member.id, 'u_admin2');
      const a = await one(`SELECT "actorId" FROM "AuditLog" WHERE action='staffpulse.link'`);
      assert.equal(a.actorId, 'u_admin2');
    });
    it('segunda ejecución accidental: no crea otra vinculación, no cambia la pulsera ni el saldo', async () => {
      const p1 = await newPulse(1);
      const p2 = await newPulse(2);
      assert.equal((await J(await selfLink('admin2', 'u_admin2', p1.code))).outcome, 'ok');
      await q(`UPDATE "Pulse" SET "drinksUsed"=2 WHERE id=$1`, [p1.id]);
      const same = await J(await selfLink('admin2', 'u_admin2', p1.code));
      const other = await J(await selfLink('admin2', 'u_admin2', p2.code));
      assert.notEqual(same.outcome, 'ok');
      assert.equal(other.outcome, 'user_has_pulse');
      assert.equal(await linksOf('u_admin2'), 1);
      assert.equal((await one(`SELECT "pulseId" FROM "StaffPulse" WHERE "userId"='u_admin2' AND "unlinkedAt" IS NULL`)).pulseId, p1.id);
      assert.equal((await one(`SELECT "drinksUsed", status::text AS s FROM "Pulse" WHERE id=$1`, [p1.id])).drinksUsed, 2);
      assert.equal((await one(`SELECT status::text AS s FROM "Pulse" WHERE id=$1`, [p2.id])).s, 'UNCLAIMED');
      assert.equal((await me('admin2')).drinksUsed, 2);
    });
    it('envíos simultáneos (doble toque): exactamente una vinculación y saldo intacto', async () => {
      const p = await newPulse(1);
      const rs = await Promise.all(Array.from({ length: 6 }, () => selfLink('admin2', 'u_admin2', p.code).then(J)));
      assert.equal(rs.filter((r) => r.outcome === 'ok').length, 1);
      assert.equal(await linksOf('u_admin2'), 1);
      assert.equal(await n(`SELECT count(*)::int AS n FROM "StaffPulse" WHERE "pulseId"=$1`, [p.id]), 1);
      assert.equal((await one(`SELECT "drinksUsed" FROM "Pulse" WHERE id=$1`, [p.id])).drinksUsed, 0);
    });
    it('pulseras no elegibles: de asistente, de otra cuenta, deshabilitada o inexistente', async () => {
      const att = await newPulse(1);
      const other = await newPulse(2);
      const dead = await newPulse(3);
      await q(`INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","updatedAt") VALUES ('at1','Asistente Uno','19-21','c1',now())`);
      await q(`UPDATE "Pulse" SET status='ACTIVE', "attendeeId"='at1', "claimedAt"=now(), "drinksUsed"=1 WHERE id=$1`, [att.id]);
      await q(`UPDATE "Pulse" SET status='INVALIDATED' WHERE id=$1`, [dead.id]);
      assert.equal((await J(await selfLink('owner', 'u_owner', other.code))).outcome, 'ok');
      assert.equal((await J(await selfLink('admin2', 'u_admin2', att.code))).outcome, 'pulse_in_use');
      assert.equal((await J(await selfLink('admin2', 'u_admin2', other.code))).outcome, 'pulse_linked');
      assert.equal((await J(await selfLink('admin2', 'u_admin2', dead.code))).outcome, 'pulse_invalidated');
      assert.equal((await J(await selfLink('admin2', 'u_admin2', 'AR26-ZZZZZ'))).outcome, 'pulse_not_found');
      assert.equal(await linksOf('u_admin2'), 0);
      // La pulsera del asistente no cambió
      assert.deepEqual(await one(`SELECT "attendeeId", "drinksUsed" FROM "Pulse" WHERE id=$1`, [att.id]), { attendeeId: 'at1', drinksUsed: 1 });
    });
    it('un Admin tampoco puede usar la ruta con un cuerpo malformado ni sin sesión', async () => {
      assert.equal((await call(adminStaffPulseFn, 'POST', '/api/admin/staff-pulse', { json: { userId: 'u_admin2', code: 'AR26-AAAAA' } })).status, 401);
      assert.equal((await call(adminStaffPulseFn, 'POST', '/api/admin/staff-pulse', { cookie: cookies.admin2, json: { userId: 5, code: null } })).status, 400);
      assert.equal(await linksOf('u_admin2'), 0);
    });
    it('cuenta desactivada no puede vincularse', async () => {
      const p = await newPulse(1);
      await q(`UPDATE "User" SET active=false WHERE id='u_s2'`);
      try {
        assert.equal((await J(await link('admin2', 'u_s2', p.code))).outcome, 'user_inactive');
      } finally {
        await q(`UPDATE "User" SET active=true WHERE id='u_s2'`);
      }
    });
  });

  /* ------------------------------------------------------------ /p/<token> y Lotes */
  describe('estado público de pulsera reservada y clasificación en Lotes', () => {
    const status = async (token: string) => J(await call(pulseFn, 'GET', `/api/pulse/${token}`, { params: { token } }));

    it('/api/pulse/:token: UNCLAIMED -> unclaimed; de asistente -> active; de equipo -> team; sin datos del miembro', async () => {
      const free = await newPulse(1);
      const mine = await newPulse(2);
      const team = await newPulse(3);
      await q(`INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","updatedAt") VALUES ('at1','Asistente Uno','19-21','c1',now())`);
      await q(`UPDATE "Pulse" SET status='ACTIVE', "attendeeId"='at1', "claimedAt"=now() WHERE id=$1`, [mine.id]);
      await link('admin2', 'u_s1', team.code);
      assert.equal((await status(free.token)).status, 'unclaimed');
      assert.equal((await status(mine.token)).status, 'active');
      const t = await status(team.token);
      assert.deepEqual(t, { status: 'team' });
      assert.ok(!JSON.stringify(t).includes('Staff Uno'));
    });
    it('una pulsera de equipo desvinculada vuelve a ser reclamable (unclaimed) solo si se libera; mientras tanto no se puede registrar', async () => {
      const team = await newPulse(3);
      await link('admin2', 'u_s1', team.code);
      for (let i = 0; i < 2; i++) {
        const r = await J(await call(claimFn, 'POST', '/api/claim', { json: { token: team.token, fullName: 'Intruso Dos', ageRange: '19-21', churchId: 'c1' } }));
        assert.equal(r.outcome, 'team');
      }
      assert.equal(await n(`SELECT count(*)::int AS n FROM "Attendee" WHERE "fullName"='Intruso Dos'`), 0);
      assert.equal((await one(`SELECT status::text AS s, "attendeeId" FROM "Pulse" WHERE id=$1`, [team.id])).attendeeId, null);
    });

    it('tres casos: vinculada al equipo -> team; ACTIVE sin asistente NI vínculo -> NO reservada (y nunca reclamable); libre -> registrable', async () => {
      const team = await newPulse(1);
      const orphan = await newPulse(2);
      const free = await newPulse(3);
      await link('admin2', 'u_s1', team.code);
      // ACTIVE sin asistente y sin vínculo: p. ej. su asistente se borró (Pulse.attendeeId es ON DELETE SET NULL)
      await q(`UPDATE "Pulse" SET status='ACTIVE', "claimedAt"=now() WHERE id=$1`, [orphan.id]);
      assert.equal(await n(`SELECT count(*)::int AS n FROM "StaffPulse" WHERE "pulseId"=$1`, [orphan.id]), 0);

      assert.deepEqual(await status(team.token), { status: 'team' });
      const o = await status(orphan.token);
      assert.equal(o.status, 'active', 'sin vínculo en StaffPulse no es «reservada»');
      assert.ok(!JSON.stringify(o).includes('Staff Uno'));
      assert.equal((await status(free.token)).status, 'unclaimed');

      const before = await n(`SELECT count(*)::int AS n FROM "Attendee"`);
      const body = (t: string) => ({ json: { token: t, fullName: 'Persona Nueva', ageRange: '19-21', churchId: 'c1' } });
      assert.equal((await J(await call(claimFn, 'POST', '/api/claim', body(team.token)))).outcome, 'team');
      assert.equal((await J(await call(claimFn, 'POST', '/api/claim', body(orphan.token)))).outcome, 'already_active');
      assert.equal(await n(`SELECT count(*)::int AS n FROM "Attendee"`), before, 'ni la de equipo ni la huérfana crean asistente');
      assert.equal((await one(`SELECT "attendeeId" FROM "Pulse" WHERE id=$1`, [orphan.id])).attendeeId, null);
      // La libre sí se registra
      assert.equal((await J(await call(claimFn, 'POST', '/api/claim', body(free.token)))).outcome, 'claimed');
      assert.equal(await n(`SELECT count(*)::int AS n FROM "Attendee"`), before + 1);
      assert.equal((await status(free.token)).status, 'active');
    });
    it('al desvincular una pulsera de equipo sin uso vuelve a unclaimed; con historial queda invalidada (nunca reservada)', async () => {
      const a = await newPulse(1);
      await link('admin2', 'u_s1', a.code);
      assert.equal((await status(a.token)).status, 'team');
      await call(adminStaffPulseFn, 'DELETE', '/api/admin/staff-pulse?userId=u_s1', { cookie: cookies.admin2 });
      assert.equal((await status(a.token)).status, 'unclaimed');
      const b = await newPulse(2);
      await link('admin2', 'u_s2', b.code);
      await q(`UPDATE "Pulse" SET "drinksUsed"=1 WHERE id=$1`, [b.id]);
      await call(adminStaffPulseFn, 'DELETE', '/api/admin/staff-pulse?userId=u_s2', { cookie: cookies.admin2 });
      assert.equal((await status(b.token)).status, 'invalidated');
    });
    it('Lotes: las de equipo cuentan en `team`, no en `active`; total = unclaimed+active+team+invalidated', async () => {
      await q(`DELETE FROM "Pulse" WHERE "batchId" IN ('bt1','bt2')`);
      await q(`DELETE FROM "Batch" WHERE id IN ('bt1','bt2')`);
      await q(`INSERT INTO "Batch"(id,code,"packageId",quantity,"createdById") VALUES ('bt1','LOTE-T1','k3',5,'u_owner'),('bt2','LOTE-VACIO','k3',0,'u_owner')`);
      const ps = [await newPulse(1), await newPulse(2), await newPulse(3), await newPulse(4), await newPulse(5)];
      await q(`UPDATE "Pulse" SET "batchId"='bt1' WHERE id = ANY($1)`, [ps.map((p) => p.id)]);
      await q(`INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","updatedAt") VALUES ('at1','Asistente Uno','19-21','c1',now())`);
      await q(`UPDATE "Pulse" SET status='ACTIVE', "attendeeId"='at1', "claimedAt"=now() WHERE id=$1`, [ps[1].id]);
      await q(`UPDATE "Pulse" SET status='INVALIDATED' WHERE id=$1`, [ps[2].id]);
      await link('admin2', 'u_s1', ps[3].code);
      await link('admin2', 'u_s2', ps[4].code);

      const list = await listBatches();
      const b = list.find((x) => x.id === 'bt1')!;
      assert.deepEqual({ total: b.total, unclaimed: b.unclaimed, active: b.active, team: b.team, invalidated: b.invalidated }, { total: 5, unclaimed: 1, active: 1, team: 2, invalidated: 1 });
      assert.equal(b.total, b.unclaimed + b.active + b.team + b.invalidated);
      const empty = list.find((x) => x.id === 'bt2')!;
      assert.deepEqual({ total: empty.total, unclaimed: empty.unclaimed, active: empty.active, team: empty.team }, { total: 0, unclaimed: 0, active: 0, team: 0 });

      // Reclamadas por asistentes = filas con attendeeId (no cambian por asignar pulseras al equipo)
      assert.equal(b.active, await n(`SELECT count(*)::int AS n FROM "Pulse" WHERE "batchId"='bt1' AND status='ACTIVE' AND "attendeeId" IS NOT NULL`));

      const act = await getBatch('bt1', '', { status: 'ACTIVE' });
      assert.deepEqual(act!.pulses.map((x) => x.id), [ps[1].id]);
      const tm = await getBatch('bt1', '', { status: 'TEAM' });
      assert.deepEqual(tm!.pulses.map((x) => x.id).sort(), [ps[3].id, ps[4].id].sort());
      assert.ok(tm!.pulses.every((x) => x.team));

      // Al desvincular una de equipo deja de contar como team (queda ACTIVE sin asistente = no se infla `active`)
      await call(adminStaffPulseFn, 'DELETE', '/api/admin/staff-pulse?userId=u_s1', { cookie: cookies.admin2 });
      const after = (await listBatches()).find((x) => x.id === 'bt1')!;
      assert.equal(after.team, 1);
      await q(`DELETE FROM "StaffPulse"`);
      await q(`DELETE FROM "Pulse" WHERE "batchId" IN ('bt1','bt2')`);
      await q(`DELETE FROM "Batch" WHERE id IN ('bt1','bt2')`);
    });
  });

  /* ------------------------------------------------------------ migración */
  /* ------------------------------------------------------------ pulseras SOLO-QR (así están las 502 de Neon) */
  describe('pulseras solo-QR («QRONLY:<token>»), como las de Lotes en Neon', () => {
    const qrOnly = async (i: number, status = 'UNCLAIMED') => {
      const token = `QRTOKENTEST0000${i}`;
      const code = `QRONLY:${token}`;
      await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","batchId","updatedAt") VALUES ($1,$2,$3,$4,'k3','b_base',now())`, [`tpq${i}`, token, status, code]);
      return { id: `tpq${i}`, token, code };
    };
    const claimBody = (t: string) => ({ json: { token: t, fullName: 'Persona Nueva', ageRange: '19-21', churchId: 'c1' } });
    const statusOf = async (token: string) => J(await call(pulseFn, 'GET', `/api/pulse/${token}`, { params: { token } }));

    it('un Admin vincula una pulsera solo-QR (por código QRONLY y por token); queda reservada y no crea asistente', async () => {
      const a = await qrOnly(1);
      const before = await n(`SELECT count(*)::int AS n FROM "Attendee"`);
      assert.equal((await statusOf(a.token)).status, 'unclaimed');
      const r = await J(await link('admin2', 'u_s1', a.code));
      assert.equal(r.outcome, 'ok');
      assert.equal((await statusOf(a.token)).status, 'team');
      assert.equal((await J(await call(claimFn, 'POST', '/api/claim', claimBody(a.token)))).outcome, 'team');
      assert.equal(await n(`SELECT count(*)::int AS n FROM "Attendee"`), before);
      // Lookup del escáner del Staff: por token y por código (así llega desde VincularPulsera)
      const byToken = await J(await call(staffPulseFn, 'GET', `/api/staff/pulse?token=${a.token}`, { cookie: cookies.s1 }));
      const byCode = await J(await call(staffPulseFn, 'GET', `/api/staff/pulse?code=${encodeURIComponent(a.code)}`, { cookie: cookies.s2 }));
      assert.equal(byToken.status, 'team');
      assert.equal(byToken.isSelf, true);
      assert.equal(byCode.status, 'team');
      assert.equal(byCode.isSelf, false);
    });
    it('canje por otra persona, autocanje denegado por defecto y permitido solo con excepción; asistente sin cambios', async () => {
      const a = await qrOnly(2);
      await link('admin2', 'u_s1', a.code);
      const other = await J(await redeem('s2', a.code, 'qr-otro-1'));
      assert.equal(other.outcome, 'ok');
      assert.equal(other.drinksRemaining, 2);
      const denied = await J(await redeem('s1', a.code, 'qr-self-1'));
      assert.equal(denied.outcome, 'self_redeem_not_allowed');
      assert.equal((await one(`SELECT "drinksUsed" FROM "Pulse" WHERE id=$1`, [a.id])).drinksUsed, 1);
      await setUser('owner', 'u_s1', 'allow');
      const mine = await J(await redeem('s1', a.code, 'qr-self-2'));
      assert.equal(mine.outcome, 'ok');
      assert.equal(await n(`SELECT count(*)::int AS n FROM "Redemption" WHERE "beneficiaryUserId"='u_s1' AND "attendeeId" IS NULL`), 2);
      assert.equal(await n(`SELECT count(*)::int AS n FROM "Redemption" WHERE "beneficiaryUserId"='u_s1' AND "createdById"='u_s1'`), 1, 'solo uno es autocanje');
    });
    it('una pulsera solo-QR registrada por un asistente se canjea como siempre y no puede vincularse al equipo', async () => {
      const a = await qrOnly(3);
      assert.equal((await J(await call(claimFn, 'POST', '/api/claim', claimBody(a.token)))).outcome, 'claimed');
      const l = await J(await link('admin2', 'u_s1', a.code));
      assert.notEqual(l.outcome, 'ok');
      assert.equal(await n(`SELECT count(*)::int AS n FROM "StaffPulse"`), 0);
      const r = await J(await redeem('s2', a.code, 'qr-asistente-1'));
      assert.equal(r.outcome, 'ok');
      const red = await one(`SELECT "attendeeId","beneficiaryUserId" FROM "Redemption" ORDER BY "createdAt" DESC LIMIT 1`);
      assert.ok(red.attendeeId);
      assert.equal(red.beneficiaryUserId, null);
    });
    it('el tablero y Lotes no cuentan la pulsera solo-QR del equipo como asistente', async () => {
      const a = await qrOnly(4);
      const b = await qrOnly(5);
      await link('admin2', 'u_s1', a.code);
      await q(`UPDATE "Pulse" SET "batchId"='b_base'`); // todas en el lote base
      await redeem('s2', a.code, 'qr-tablero-1');
      const d: any = await getDashboard(parseFilters(new URLSearchParams()) as any);
      assert.equal(d.drinks.used, 0, 'el consumo del equipo no entra en el tablero de asistentes');
      assert.equal(d.registered, 0);
      const lote = (await listBatches()).find((x) => x.id === 'b_base')!;
      assert.equal(lote.team, 1);
      assert.equal(lote.unclaimed, 1);
      assert.equal(lote.active, 0);
      void b;
    });
  });

  describe('notas de asistentes en la vista de visitante del equipo (solo lectura)', () => {
    const TOK = 'ATTENDEETOKEN001';
    async function seedNotes() {
      await q(`INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","updatedAt") VALUES ('at1','Ana Pérez','19-21','c1',now()),('at2','Beto Ruiz','19-21','c1',now())`);
      await newPulse(1);
      await q(`UPDATE "Pulse" SET status='ACTIVE', "attendeeId"='at1', "qrToken"=$1 WHERE id='tp1'`, [TOK]);
      await q(
        `INSERT INTO "Note"(id,"attendeeId","text","visibility","createdAt","expiresAt") VALUES
         ('atn1','at1','Hola desde Ana','PUBLIC',now() at time zone 'utc',(now() at time zone 'utc') + interval '1 hour'),
         ('atn2','at2','Nota privada','PRIVATE',now() at time zone 'utc',(now() at time zone 'utc') + interval '1 hour'),
         ('atn3','at2','Nota vencida','PUBLIC',(now() at time zone 'utc') - interval '2 hour',(now() at time zone 'utc') - interval '1 hour')`,
      );
    }
    it('cuenta del equipo (cookie, sin token): ve solo notas públicas y vigentes, sin me gusta propio', async () => {
      await seedNotes();
      const r = await call(notesFeedFn, 'GET', '/api/notes/feed', { cookie: cookies.s1 });
      assert.equal(r.status, 200);
      const b = await J(r);
      assert.deepEqual(b.notes.map((x: any) => x.id), ['atn1']);
      assert.equal(b.notes[0].firstName, 'Ana');
      assert.equal(b.notes[0].likedByMe, false);
      assert.equal(b.notes[0].likeCount, 0);
      assert.equal('fullName' in b.notes[0], false);
    });
    it('sin cookie y sin token -> 401; una pulsera inválida NUNCA cae a la ruta del equipo, aunque haya cookie', async () => {
      await seedNotes();
      assert.equal((await call(notesFeedFn, 'GET', '/api/notes/feed')).status, 401);
      assert.equal((await call(notesFeedFn, 'GET', '/api/notes/feed', { token: 'NOEXISTE00000000' })).status, 401);
      assert.equal((await call(notesFeedFn, 'GET', '/api/notes/feed', { cookie: cookies.s1, token: 'NOEXISTE00000000' })).status, 401);
    });
    it('el asistente con su token sigue sin ver sus propias notas y la cookie del equipo no da me gusta', async () => {
      await seedNotes();
      const mine = await J(await call(notesFeedFn, 'GET', '/api/notes/feed', { token: TOK }));
      assert.deepEqual(mine.notes, []); // sus notas excluidas; las de at2 son privada/vencida
      const like = await call(notesLikeFn, 'POST', '/api/notes/atn1/like', { cookie: cookies.s1, params: { id: 'atn1' } });
      assert.equal(like.status, 401);
      assert.equal(await n(`SELECT count(*)::int AS n FROM "NoteLike"`), 0);
    });
  });

  describe('migración 012', () => {
    it('es idempotente y conserva el historial de canjes existente', async () => {
      const url = assertSafeTestDatabase(TEST_URL);
      const c = await resetTeamDatabase(url, { with012: false });
      try {
        await c.query(`INSERT INTO "Zone"(id,name) VALUES ('z1','Z')`);
        await c.query(`INSERT INTO "Presbytery"(id,name,"zoneId") VALUES ('p1','P','z1')`);
        await c.query(`INSERT INTO "Church"(id,name,"presbyteryId") VALUES ('c1','C','p1')`);
        await c.query(`INSERT INTO "Package"(id,name,price,"includedDrinks","updatedAt") VALUES ('k3','K',1,3,now())`);
        await c.query(`INSERT INTO "User"(id,email,name,role,"passwordHash","updatedAt") VALUES ('u1','a@a','A','STAFF','x',now())`);
        await c.query(`INSERT INTO "Batch"(id,code,"packageId",quantity,"createdById") VALUES ('b0','LOTE-0','k3',0,'u1')`);
        await c.query(`INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","updatedAt") VALUES ('a1','Ana','19-21','c1',now())`);
        await c.query(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","attendeeId","drinksUsed","batchId","updatedAt") VALUES ('p1','AAAAAAAAAAAAAA01','ACTIVE','AR26-AAAAA','k3','a1',1,'b0',now())`);
        await c.query(`INSERT INTO "Redemption"(id,"attendeeId","pulseId","packageId","idempotencyKey","createdById") VALUES ('r1','a1','p1','k3','old-1','u1')`);
        await applyMigration(c, MIGRATION_012);
        await applyMigration(c, MIGRATION_012);
        const r = (await c.query(`SELECT "attendeeId","beneficiaryUserId" FROM "Redemption" WHERE id='r1'`)).rows[0];
        assert.deepEqual(r, { attendeeId: 'a1', beneficiaryUserId: null });
        await assert.rejects(c.query(`INSERT INTO "Redemption"(id,"attendeeId","beneficiaryUserId","pulseId","packageId","idempotencyKey","createdById") VALUES ('r2',NULL,NULL,'p1','k3','k2','u1')`), /redemption_one_beneficiary/);
        await assert.rejects(c.query(`INSERT INTO "Redemption"(id,"attendeeId","beneficiaryUserId","pulseId","packageId","idempotencyKey","createdById") VALUES ('r3','a1','u1','p1','k3','k3','u1')`), /redemption_one_beneficiary/);
        assert.equal((await c.query(`SELECT count(*)::int AS n FROM "SelfRedeemSetting" WHERE allowed=false`)).rows[0].n, 2);
      } finally {
        await c.end();
      }
    });
    /* ---------- rollback: docs/rollback/012_staff_selfredeem_down.sql (siempre sobre bases desechables) ---------- */
    const ROLLBACK_SQL = fs.readFileSync(path.resolve('docs', 'rollback', '012_staff_selfredeem_down.sql'), 'utf8');
    /** Esquema real + datos con la forma de Neon (pulseras solo-QR, un canje de asistente) y la 012 aplicada. */
    async function rollbackFixture() {
      const url = assertSafeTestDatabase(TEST_URL);
      const c = await resetTeamDatabase(url, { with012: true });
      await c.query(`INSERT INTO "Zone"(id,name) VALUES ('z1','Z'); INSERT INTO "Presbytery"(id,name,"zoneId") VALUES ('p1','P','z1'); INSERT INTO "Church"(id,name,"presbyteryId") VALUES ('c1','C','p1');
        INSERT INTO "Package"(id,name,price,"includedDrinks","updatedAt") VALUES ('k3','K',1,3,now());
        INSERT INTO "User"(id,email,name,role,"passwordHash","updatedAt") VALUES ('o','o@x','Dueño','ADMIN','x',now()),('s1','s1@x','S1','STAFF','x',now());
        INSERT INTO "Batch"(id,code,"packageId",quantity,"createdById") VALUES ('b1','LOTE-1','k3',3,'o');
        INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","updatedAt") VALUES ('a1','Ana','19-21','c1',now());
        INSERT INTO "Pulse"(id,"qrToken","manualCode","packageId","batchId","status","attendeeId","drinksUsed","updatedAt") VALUES
          ('pa','QRTOKENTEST00001','QRONLY:QRTOKENTEST00001','k3','b1','ACTIVE','a1',1,now()),
          ('pt','QRTOKENTEST00002','QRONLY:QRTOKENTEST00002','k3','b1','UNCLAIMED',NULL,0,now()),
          ('pl','QRTOKENTEST00003','QRONLY:QRTOKENTEST00003','k3','b1','UNCLAIMED',NULL,0,now());
        INSERT INTO "Redemption"(id,"attendeeId","pulseId","packageId","idempotencyKey","createdById") VALUES ('r_old','a1','pa','k3','old-1','s1');`);
      return c;
    }
    const runRollback = async (c: pg.Client) => {
      try {
        await c.query(ROLLBACK_SQL);
        return 'ok';
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        return String((e as Error).message);
      }
    };
    const exists = async (c: pg.Client, t: string) => (await c.query(`SELECT to_regclass('"${t}"')::text AS t`)).rows[0].t !== null;
    const attendeeNullable = async (c: pg.Client) => (await c.query(`SELECT is_nullable FROM information_schema.columns WHERE table_name='Redemption' AND column_name='attendeeId'`)).rows[0].is_nullable;
    const keepsAttendeeData = async (c: pg.Client) => {
      assert.equal((await c.query(`SELECT count(*)::int AS n FROM "Redemption" WHERE id='r_old' AND "attendeeId"='a1'`)).rows[0].n, 1);
      assert.equal((await c.query(`SELECT count(*)::int AS n FROM "Pulse"`)).rows[0].n, 3);
    };

    it('rollback sin datos del equipo (ajustes de fábrica): revierte, conserva canjes y pulseras solo-QR, y se puede repetir', async () => {
      const c = await rollbackFixture();
      try {
        assert.equal(await runRollback(c), 'ok');
        assert.equal(await attendeeNullable(c), 'NO', 'attendeeId vuelve a NOT NULL');
        for (const t of ['StaffPulse', 'SelfRedeemSetting', 'SelfRedeemOverride']) assert.equal(await exists(c, t), false, t);
        assert.equal((await c.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname IN ('staffpulse_require_unowned_pulse','pulse_block_attendee_when_team')`)).rows[0].n, 0);
        await keepsAttendeeData(c);
        assert.equal(await runRollback(c), 'ok', 'repetirlo no falla');
        await applyMigration(c, MIGRATION_012);
        await applyMigration(c, MIGRATION_012);
        assert.equal(await attendeeNullable(c), 'YES');
      } finally {
        await c.end();
      }
    });
    it('rollback ABORTA y no cambia nada si hay vínculos de equipo o canjes de equipo', async () => {
      const c = await rollbackFixture();
      try {
        await c.query(`UPDATE "Pulse" SET status='ACTIVE' WHERE id='pt'; INSERT INTO "StaffPulse"(id,"userId","pulseId","createdAt") VALUES ('sp1','s1','pt',now())`);
        assert.match(await runRollback(c), /StaffPulse/);
        await c.query(`INSERT INTO "Redemption"(id,"attendeeId","beneficiaryUserId","pulseId","packageId","idempotencyKey","createdById") VALUES ('r_team',NULL,'s1','pt','k3','team-1','s1'); DELETE FROM "StaffPulse"`);
        assert.match(await runRollback(c), /canjes de equipo/);
        assert.equal(await attendeeNullable(c), 'YES');
        assert.equal(await exists(c, 'StaffPulse'), true);
        assert.equal((await c.query(`SELECT count(*)::int AS n FROM "Redemption"`)).rows[0].n, 2);
      } finally {
        await c.end();
      }
    });
    it('rollback ABORTA si hay un interruptor de autocanje activado o una excepción por persona (la configuración no se pierde)', async () => {
      const c = await rollbackFixture();
      try {
        await c.query(`UPDATE "SelfRedeemSetting" SET allowed=true WHERE role='STAFF'`);
        assert.match(await runRollback(c), /SelfRedeemSetting/);
        await c.query(`UPDATE "SelfRedeemSetting" SET allowed=false; INSERT INTO "SelfRedeemOverride"("userId",mode) VALUES ('s1','allow')`);
        assert.match(await runRollback(c), /SelfRedeemOverride/);
        // Nada se perdió
        assert.equal(await exists(c, 'SelfRedeemOverride'), true);
        assert.equal((await c.query(`SELECT count(*)::int AS n FROM "SelfRedeemOverride"`)).rows[0].n, 1);
        assert.equal(await attendeeNullable(c), 'YES');
        await keepsAttendeeData(c);
        // Un interruptor apagado pero con autor registrado también cuenta como configuración
        await c.query(`DELETE FROM "SelfRedeemOverride"; UPDATE "SelfRedeemSetting" SET "updatedById"='o' WHERE role='ADMIN'`);
        assert.match(await runRollback(c), /SelfRedeemSetting/);
      } finally {
        await c.end();
      }
    });
    it('rollback con configuración SOLO procede con la confirmación explícita, y esa confirmación no salta la guarda de canjes', async () => {
      const c = await rollbackFixture();
      try {
        await c.query(`UPDATE "SelfRedeemSetting" SET allowed=true WHERE role='STAFF'; INSERT INTO "SelfRedeemOverride"("userId",mode) VALUES ('s1','deny')`);
        assert.match(await runRollback(c), /SelfRedeemOverride|SelfRedeemSetting/);
        await c.query(`SET arraigados.confirmo_perder_ajustes = 'si'`);
        // Con confirmación pero con un canje de equipo: sigue abortando
        await c.query(`INSERT INTO "Redemption"(id,"attendeeId","beneficiaryUserId","pulseId","packageId","idempotencyKey","createdById") VALUES ('r_team',NULL,'s1','pt','k3','team-1','s1')`);
        assert.match(await runRollback(c), /canjes de equipo/);
        await c.query(`DELETE FROM "Redemption" WHERE id='r_team'`);
        assert.equal(await runRollback(c), 'ok');
        assert.equal(await exists(c, 'SelfRedeemSetting'), false);
        await keepsAttendeeData(c);
        await applyMigration(c, MIGRATION_012); // deja la base con la 012 para el beforeEach de la prueba siguiente
      } finally {
        await c.end();
      }
    });
    it('SIN la migración 012: pulseras normales funcionan y una ACTIVE sin asistente no revienta ni se marca reservada', async () => {
      const url = assertSafeTestDatabase(TEST_URL);
      const c = await resetTeamDatabase(url, { with012: false });
      try {
        assert.equal((await c.query(`SELECT to_regclass('"StaffPulse"')::text AS t`)).rows[0].t, null, 'sin 012 no existe StaffPulse');
        await c.query(`INSERT INTO "Zone"(id,name) VALUES ('z1','Z')`);
        await c.query(`INSERT INTO "Presbytery"(id,name,"zoneId") VALUES ('p1','P','z1')`);
        await c.query(`INSERT INTO "Church"(id,name,"presbyteryId") VALUES ('c1','C','p1')`);
        await c.query(`INSERT INTO "Package"(id,name,price,"includedDrinks","updatedAt") VALUES ('k3','K',1,3,now())`);
        await c.query(`INSERT INTO "User"(id,email,name,role,"passwordHash","updatedAt") VALUES ('u1','a@a','A','STAFF','x',now())`);
        await c.query(`INSERT INTO "Batch"(id,code,"packageId",quantity,"createdById") VALUES ('b0','LOTE-0','k3',0,'u1')`);
        const mk = (id: string, tok: string, code: string, st: string) =>
          c.query(`INSERT INTO "Pulse"(id,"qrToken","manualCode","packageId",status,"batchId","updatedAt") VALUES ($1,$2,$3,'k3',$4,'b0',now())`, [id, tok, code, st]);
        await mk('fp', 'FREEPULSETOKEN01', 'AR26-FREE2', 'UNCLAIMED');
        await mk('op', 'ORPHANPULSETOK01', 'AR26-ORPH2', 'ACTIVE');
        const st = async (t: string) => J(await call(pulseFn, 'GET', `/api/pulse/${t}`, { params: { token: t } }));
        const cl = async (t: string) => J(await call(claimFn, 'POST', '/api/claim', { json: { token: t, fullName: 'Persona Nueva', ageRange: '19-21', churchId: 'c1' } }));
        assert.equal((await st('FREEPULSETOKEN01')).status, 'unclaimed');
        assert.equal((await st('ORPHANPULSETOK01')).status, 'active');
        assert.equal((await cl('ORPHANPULSETOK01')).outcome, 'already_active');
        assert.equal((await c.query(`SELECT "attendeeId" FROM "Pulse" WHERE id='op'`)).rows[0].attendeeId, null);
        assert.equal((await cl('FREEPULSETOKEN01')).outcome, 'claimed');
        // Escáner y canje del Staff sobre la pulsera sin asistente: sin error aunque falte la tabla
        assert.notEqual((await lookupPulse({ code: 'AR26-ORPH2' }, { id: 'u1', role: 'STAFF' })).status, 'team');
        assert.deepEqual(await redeemOne('AR26-ORPH2', 'idem-sin-012-1', { id: 'u1', role: 'STAFF' }), { outcome: 'pulse_not_active' });
      } finally {
        await c.end();
      }
    });
  });

});
