import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import type pg from 'pg';
import { assertSafeTestDatabase, resetTeamDatabase } from './testdb.mts';
import { setRateLimitStoreForTests } from '../../server/rateLimit';
import { buildSummary, canEditDiscounts, discountCents, parseAmount, DISCOUNT_EDITORS } from '../../server/teamDiscount';
import loginFn from '../../netlify/functions/auth-login.mts';
import discountFn from '../../netlify/functions/admin-team-discounts.mts';

/** Bloque 3 · descuentos del equipo e ingresos SIMULADOS (migración 013). Dinero en centavos enteros. */
const OWNER = 'javiercastro9912@gmail.com';
const PERLA = 'perlarivera@redjuveniltijuana.com';

describe('descuentos · fórmulas (sin base de datos)', () => {
  it('porcentaje: precio × % / 100, en centavos', () => {
    assert.equal(discountCents(25000, 'percent', 1000), 2500); // 10 %
    assert.equal(discountCents(25000, 'percent', 1250), 3125); // 12.5 %
    assert.equal(discountCents(25000, 'percent', 0), 0);
    assert.equal(discountCents(25000, 'percent', 10000), 25000); // 100 %
  });
  it('monto fijo: el monto en centavos, nunca más que el precio', () => {
    assert.equal(discountCents(25000, 'fixed', 5000), 5000);
    assert.equal(discountCents(25000, 'fixed', 99999999), 25000);
    assert.equal(discountCents(0, 'fixed', 5000), 0);
  });
  it('nunca negativo ni NaN; el precio simulado nunca es negativo', () => {
    for (const v of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const d = discountCents(25000, 'fixed', v);
      assert.ok(d >= 0 && d <= 25000);
    }
    assert.equal(discountCents(25000, 'percent', 20000), 25000); // porcentaje fuera de rango se acota a 100 %
  });
  it('parseAmount: convierte % y pesos a enteros y rechaza lo inválido', () => {
    assert.deepEqual(parseAmount('percent', 12.5), { type: 'percent', value: 1250 });
    assert.deepEqual(parseAmount('fixed', 50), { type: 'fixed', value: 5000 });
    assert.deepEqual(parseAmount('fixed', 0.1 + 0.2 - 0.2), { type: 'fixed', value: 10 });
    for (const [t, a] of [['percent', -1], ['percent', 100.01], ['percent', 1.005], ['fixed', -0.01], ['fixed', 'abc'], ['fixed', Number.NaN], ['fixed', 1e9], ['other', 5], [undefined, 5]] as const) {
      assert.throws(() => parseAmount(t, a), `${t} ${String(a)}`);
    }
  });
  it('permiso de edición: solo los dos correos, sin importar mayúsculas', () => {
    assert.deepEqual([...DISCOUNT_EDITORS].sort(), [PERLA, OWNER].sort());
    assert.ok(canEditDiscounts(OWNER) && canEditDiscounts(` ${PERLA.toUpperCase()} `));
    assert.ok(!canEditDiscounts('otro@admin.com') && !canEditDiscounts('') && !canEditDiscounts(null) && !canEditDiscounts(undefined));
  });
  it('resumen: cuenta una vez, mezcla Staff/Admin y respeta la referencia', () => {
    const pk = [{ id: 'a', name: 'Kit-A', price: 10000, active: true }, { id: 'b', name: 'Kit-B', price: 20000, active: true }];
    const r = buildSummary(pk, new Map([['a', 3], ['b', 1]]), new Map([['a', 1]]), new Map([['b', 2]]), {
      STAFF: { type: 'percent', value: 5000 }, ADMIN: { type: 'fixed', value: 3000 },
    });
    assert.equal(r.totals.attendeeRevenueCents, 3 * 10000 + 20000);
    assert.equal(r.totals.team, 3);
    assert.equal(r.totals.discountCents, 5000 + 2 * 3000);
    assert.equal(r.totals.teamSimulatedCents, 10000 + 2 * 20000 - 11000);
    assert.equal(r.totals.combinedCents, r.totals.attendeeRevenueCents + r.totals.teamSimulatedCents);
  });
});

const TEST_URL = process.env.TEST_DATABASE_URL;
describe('descuentos · endpoints y permisos · PostgreSQL real', { skip: TEST_URL ? false : 'TEST_DATABASE_URL no definida' }, () => {
  let db: pg.Client;
  const cookies: Record<string, string> = {};
  const q = (t: string, v: unknown[] = []) => db.query(t, v);
  const one = async (t: string, v: unknown[] = []) => (await q(t, v)).rows[0];
  let ip = 0;
  const call = (fn: (r: Request, c: any) => Promise<Response>, method: string, url: string, o: { cookie?: string; json?: unknown } = {}) => {
    const headers: Record<string, string> = {};
    if (o.cookie) headers.cookie = o.cookie;
    let body: string | undefined;
    if (o.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(o.json);
    }
    return fn(new Request(`http://localhost${url}`, { method, headers, body }), { ip: `203.0.113.${(++ip % 250) + 1}`, params: {} });
  };
  const J = async (r: Response) => (await r.json()) as any;
  const get = (who?: string) => call(discountFn, 'GET', '/api/admin/team-discounts', { cookie: who ? cookies[who] : undefined });
  const put = (who: string | undefined, json: unknown) => call(discountFn, 'PUT', '/api/admin/team-discounts', { cookie: who ? cookies[who] : undefined, json });
  const settings = async () => (await q(`SELECT "role","type","value" FROM "TeamDiscountSetting" ORDER BY "role"`)).rows;

  before(async () => {
    const url = assertSafeTestDatabase(TEST_URL!);
    process.env.DATABASE_URL = url.toString();
    process.env.SESSION_SECRET = 'integration-secret-integration-secret-123';
    delete process.env.OWNER_EMAIL;
    for (const k of ['error', 'log', 'warn', 'info'] as const) console[k] = () => {};
    db = await resetTeamDatabase(url);
    const h = (p: string) => bcrypt.hashSync(p, 4);
    const users = [
      ['u_owner', OWNER, 'Javier', 'ADMIN', true], ['u_perla', PERLA, 'Perla', 'ADMIN', true], ['u_other', 'otro@test.local', 'Otro Admin', 'ADMIN', true],
      ['u_s1', 's1@test.local', 'Staff Uno', 'STAFF', true], ['u_s2', 's2@test.local', 'Staff Dos', 'STAFF', true],
      ['u_s3', 's3@test.local', 'Staff Tres (sin pulsera)', 'STAFF', true], ['u_s4', 's4@test.local', 'Staff Cuatro (inactivo)', 'STAFF', false],
    ] as const;
    for (const [id, email, name, role, active] of users) {
      await q(`INSERT INTO "User"(id,email,name,role,active,"passwordHash","updatedAt") VALUES ($1,$2,$3,$4::"UserRole",$5,$6,now())`, [id, email, name, role, active, h('Pass-word-1')]);
    }
    await q(`INSERT INTO "Zone"(id,name) VALUES ('z1','Zona 1')`);
    await q(`INSERT INTO "Presbytery"(id,name,"zoneId") VALUES ('p1','Presbiterio','z1')`);
    await q(`INSERT INTO "Church"(id,name,"presbyteryId") VALUES ('c1','Iglesia Central','p1')`);
    await q(`INSERT INTO "Package"(id,name,price,"includedDrinks","updatedAt") VALUES ('ka','Kit-A',25000,3,now()),('kb','Kit-B',40000,3,now()),('ke','Especial',60000,3,now())`);
    await q(`INSERT INTO "Batch"(id,code,"packageId",quantity,"createdById") VALUES ('b1','LOTE-1','ka',0,'u_owner')`);
    for (const [k, email] of [['owner', OWNER], ['perla', PERLA], ['other', 'otro@test.local'], ['s1', 's1@test.local']] as const) {
      const r = await call(loginFn, 'POST', '/api/auth/login', { json: { email, password: 'Pass-word-1' } });
      cookies[k] = (r.headers.get('set-cookie') ?? '').split(';')[0];
      assert.ok(cookies[k], `login ${k}`);
    }
  });
  after(async () => {
    setRateLimitStoreForTests(null);
    await db?.end();
  });
  beforeEach(async () => {
    setRateLimitStoreForTests(null);
    await q(`DELETE FROM "RateLimit"`).catch(() => {});
    await q(`DELETE FROM "AuditLog"`);
    await q(`DELETE FROM "StaffPulse"`).catch(() => {});
    await q(`DELETE FROM "Pulse"`);
    await q(`DELETE FROM "Attendee"`);
    await q(`UPDATE "TeamDiscountSetting" SET "type"='percent', "value"=0`).catch(() => {});
    // asistentes: 2 en Kit-A, 1 en Kit-B, 1 en Especial; 1 asistente con pulsera deshabilitada (no cuenta)
    const att = [['at1', 'ka'], ['at2', 'ka'], ['at3', 'kb'], ['at4', 'ke'], ['at5', 'ka']] as const;
    for (const [id, pk] of att) {
      await q(`INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","updatedAt") VALUES ($1,$2,'19-21','c1',now())`, [id, `Asistente ${id}`]);
      await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","batchId","attendeeId","updatedAt") VALUES ($1,$2,$3::"PulseStatus",$4,$5,'b1',$6,now())`,
        [`pl_${id}`, `TOK${id}XXXXXXXXXXXXX`, id === 'at5' ? 'INVALIDATED' : 'ACTIVE', `AR26-${id.toUpperCase()}`, pk, id]);
    }
    // equipo: s1 (Staff, Kit-A), owner (Admin, Kit-B), s2 (Staff pulsera desvinculada -> no cuenta), s4 (inactivo -> no cuenta)
    const team = [['tp1', 'ka', 'u_s1', false], ['tp2', 'kb', 'u_owner', false], ['tp3', 'ka', 'u_s2', true], ['tp4', 'ke', 'u_s4', false]] as const;
    for (const [id, pk, user, unlinked] of team) {
      await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","batchId","updatedAt") VALUES ($1,$2,'ACTIVE',$3,$4,'b1',now())`, [id, `TOK${id}XXXXXXXXXXXXX`, `AR26-${id.toUpperCase()}`, pk]);
      await q(`INSERT INTO "StaffPulse"(id,"userId","pulseId","linkedById","createdAt","unlinkedAt") VALUES ($1,$2,$3,'u_owner',now(),$4)`, [`sp_${id}`, user, id, unlinked ? new Date() : null]);
    }
  });

  it('valores iniciales 0: sin descuento, el equipo se cuenta una vez y no se mezcla con asistentes', async () => {
    const d = await J(await get('other'));
    assert.deepEqual(d.rules, { STAFF: { type: 'percent', amount: 0, active: false }, ADMIN: { type: 'percent', amount: 0, active: false } });
    assert.equal(d.configAvailable, true);
    assert.equal(d.teamAvailable, true);
    assert.equal(d.totals.attendees, 4);
    assert.equal(d.totals.staff, 1);
    assert.equal(d.totals.admin, 1);
    assert.equal(d.totals.team, 2);
    assert.equal(d.totals.attendeeRevenueCents, 2 * 25000 + 40000 + 60000);
    assert.equal(d.totals.discountCents, 0);
    assert.equal(d.totals.teamSimulatedCents, 25000 + 40000);
    assert.equal(d.totals.combinedCents, d.totals.attendeeRevenueCents + 65000);
    const byName = Object.fromEntries(d.byKit.map((k: any) => [k.name, k]));
    assert.deepEqual([byName['Kit-A'].attendees, byName['Kit-A'].staff, byName['Kit-A'].admin], [2, 1, 0]);
    assert.deepEqual([byName['Kit-B'].attendees, byName['Kit-B'].staff, byName['Kit-B'].admin], [1, 0, 1]);
    assert.deepEqual([byName['Especial'].attendees, byName['Especial'].staff, byName['Especial'].admin], [1, 0, 0]);
  });

  it('un Admin sin permiso puede ver, pero no modificar (aunque mande el correo del dueño en el cuerpo)', async () => {
    assert.equal((await J(await get('other'))).canEdit, false);
    assert.equal((await J(await get('owner'))).canEdit, true);
    assert.equal((await J(await get('perla'))).canEdit, true);
    const r = await put('other', { role: 'STAFF', type: 'percent', amount: 50, email: OWNER, userEmail: OWNER });
    assert.equal(r.status, 403);
    assert.deepEqual((await settings()).map((s) => s.value), [0, 0]);
    assert.equal((await one(`SELECT count(*)::int n FROM "AuditLog" WHERE action='teamDiscount.update'`)).n, 0);
  });

  it('sin sesión 401; Staff 403 (también al leer)', async () => {
    assert.equal((await get()).status, 401);
    assert.equal((await put(undefined, { role: 'STAFF', type: 'percent', amount: 5 })).status, 401);
    assert.equal((await get('s1')).status, 403);
    assert.equal((await put('s1', { role: 'STAFF', type: 'percent', amount: 5 })).status, 403);
    assert.equal((await call(discountFn, 'DELETE', '/api/admin/team-discounts', { cookie: cookies.owner })).status, 405);
  });

  it('porcentaje: se guarda en puntos base, recalcula el resumen por kit y deja auditoría', async () => {
    let r = await put('owner', { role: 'STAFF', type: 'percent', amount: 10 });
    assert.equal(r.status, 200);
    r = await put('perla', { role: 'ADMIN', type: 'percent', amount: 12.5 });
    const d = await J(r);
    assert.deepEqual((await settings()).map((s) => [s.role, s.type, s.value]), [['ADMIN', 'percent', 1250], ['STAFF', 'percent', 1000]]);
    assert.deepEqual(d.rules.STAFF, { type: 'percent', amount: 10, active: true });
    assert.equal(d.totals.discountCents, 2500 + 5000); // staff Kit-A 10 % de 25000; admin Kit-B 12.5 % de 40000
    assert.equal(d.totals.teamSimulatedCents, 65000 - 7500);
    assert.equal((await one(`SELECT count(*)::int n FROM "AuditLog" WHERE action='teamDiscount.update'`)).n, 2);
  });

  it('monto fijo en pesos: se guarda en centavos y se acota al precio normal', async () => {
    await put('owner', { role: 'STAFF', type: 'fixed', amount: 50 });
    await put('owner', { role: 'ADMIN', type: 'fixed', amount: 99999 });
    const d = await J(await get('owner'));
    assert.deepEqual((await settings()).map((s) => [s.role, s.value]), [['ADMIN', 9999900], ['STAFF', 5000]]);
    assert.equal(d.totals.discountCents, 5000 + 40000); // admin Kit-B: acotado a $400
    assert.equal(d.totals.teamSimulatedCents, 20000 + 0);
    for (const k of d.byKit) assert.ok(k.teamSimulatedCents >= 0);
  });

  it('validaciones: negativo, texto, decimales de más, >100 %, tipo o rol inválidos -> 400 y nada cambia', async () => {
    const bad = [
      { role: 'STAFF', type: 'percent', amount: -1 }, { role: 'STAFF', type: 'percent', amount: 101 },
      { role: 'STAFF', type: 'percent', amount: '10' }, { role: 'STAFF', type: 'fixed', amount: 10.123 },
      { role: 'STAFF', type: 'fixed', amount: null }, { role: 'STAFF', type: 'otro', amount: 10 },
      { role: 'OWNER', type: 'percent', amount: 10 }, { type: 'percent', amount: 10 }, {},
    ];
    for (const b of bad) assert.equal((await put('owner', b)).status, 400, JSON.stringify(b));
    assert.deepEqual((await settings()).map((s) => s.value), [0, 0]);
    const raw = await call(discountFn, 'PUT', '/api/admin/team-discounts', { cookie: cookies.owner });
    assert.equal(raw.status, 400);
  });

  it('no toca paquetes, precios ni canjes', async () => {
    const snap = async () => JSON.stringify([(await q(`SELECT id,price,"includedDrinks" FROM "Package" ORDER BY id`)).rows, (await q(`SELECT count(*) FROM "Redemption"`)).rows]);
    const before = await snap();
    await put('owner', { role: 'STAFF', type: 'percent', amount: 30 });
    await put('owner', { role: 'ADMIN', type: 'fixed', amount: 100 });
    assert.equal(await snap(), before);
  });

  it('sin la migración 013: se puede leer (en 0) pero no guardar', async () => {
    await q(`DROP TABLE "TeamDiscountSetting"`);
    try {
      const d = await J(await get('owner'));
      assert.equal(d.configAvailable, false);
      assert.equal(d.rules.STAFF.active, false);
      assert.equal(d.totals.team, 2);
      assert.equal((await put('owner', { role: 'STAFF', type: 'percent', amount: 5 })).status, 400);
    } finally {
      await db.query(await (await import('node:fs')).promises.readFile('migrations/013_team_discount.sql', 'utf8'));
    }
  });

  it('sin la migración 012: el equipo cuenta 0 y no falla', async () => {
    await q(`DROP TABLE "StaffPulse" CASCADE`);
    const d = await J(await get('owner'));
    assert.equal(d.teamAvailable, false);
    assert.equal(d.totals.team, 0);
    assert.equal(d.totals.attendees, 4);
  });
});
