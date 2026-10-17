import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import type pg from 'pg';
import { assertSafeTestDatabase, resetTeamDatabase } from './testdb.mts';
import { setRateLimitStoreForTests } from '../../server/rateLimit';
import loginFn from '../../netlify/functions/auth-login.mts';
import attendeesFn from '../../netlify/functions/admin-attendees.mts';

/** Admin → Asistentes: filtro por tipo de registro (todos / asistentes / equipo). Solo lectura. */
const TEST_URL = process.env.TEST_DATABASE_URL;
describe('lista de asistentes · filtro por tipo · PostgreSQL real', { skip: TEST_URL ? false : 'TEST_DATABASE_URL no definida' }, () => {
  let db: pg.Client;
  let url: URL;
  const cookies: Record<string, string> = {};
  const q = (t: string, v: unknown[] = []) => db.query(t, v);
  let ip = 0;
  const call = (fn: any, path: string, who?: string) =>
    fn(new Request(`http://localhost${path}`, { headers: who ? { cookie: cookies[who] } : {} }), { ip: `203.0.113.${(++ip % 250) + 1}`, params: {} }) as Promise<Response>;
  const list = async (qs = '') => (await (await call(attendeesFn, `/api/admin/attendees?pageSize=50${qs}`, 'admin')).json()) as any;
  const names = (r: any) => r.rows.map((x: any) => x.fullName).sort();
  const login = async (k: string, email: string) => {
    const r = await call2(loginFn, email);
    cookies[k] = (r.headers.get('set-cookie') ?? '').split(';')[0];
    assert.ok(cookies[k], `login ${k}`);
  };
  const call2 = (fn: any, email: string) =>
    fn(new Request('http://localhost/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Pass-word-1' }) }), { ip: `198.51.100.${(++ip % 250) + 1}`, params: {} }) as Promise<Response>;

  const seed = async () => {
    const h = bcrypt.hashSync('Pass-word-1', 4);
    await q(`INSERT INTO "User"(id,email,name,role,active,"passwordHash","updatedAt") VALUES
      ('u_admin','k_admin@test.local','Ana Admin','ADMIN',true,$1,now()),('u_staff','k_staff@test.local','Saúl Staff','STAFF',true,$1,now()),
      ('u_old','k_old@test.local','Ex Equipo','STAFF',true,$1,now()),('u_nolink','k_nolink@test.local','Sin Pulsera','STAFF',true,$1,now())`, [h]);
    await q(`INSERT INTO "Zone"(id,name) VALUES ('z1','Zona 1')`);
    await q(`INSERT INTO "Presbytery"(id,name,"zoneId") VALUES ('p1','Presbiterio','z1')`);
    await q(`INSERT INTO "Church"(id,name,"presbyteryId") VALUES ('c1','Iglesia Central','p1')`);
    await q(`INSERT INTO "Package"(id,name,price,"includedDrinks","updatedAt") VALUES ('k1','Kit A',10000,3,now()),('k2','Kit B',20000,0,now())`);
    await q(`INSERT INTO "Batch"(id,code,"packageId",quantity,"createdById") VALUES ('b1','LOTE-1','k1',0,'u_admin')`);
    for (const [id, name, pk] of [['a1', 'Ana Asistente', 'k1'], ['a2', 'Beto Asistente', 'k2']] as const) {
      await q(`INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","updatedAt") VALUES ($1,$2,'19-21','c1',now())`, [id, name]);
      await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","batchId","attendeeId","updatedAt") VALUES ($1,$2,'ACTIVE',$3,$4,'b1',$5,now())`, [`p_${id}`, `TOK${id}XXXXXXXXXXXXXX`, `AR26-${id.toUpperCase()}`, pk, id]);
    }
    // Pulseras sin dueño, vinculadas al equipo (u_old: vínculo ya desvinculado; no cuenta).
    for (const [id, user, pk, unlinked] of [['t1', 'u_admin', 'k1', false], ['t2', 'u_staff', 'k2', false], ['t3', 'u_old', 'k1', true]] as const) {
      await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","batchId","updatedAt") VALUES ($1,$2,'ACTIVE',$3,$4,'b1',now())`, [id, `TOK${id}XXXXXXXXXXXXXX`, `AR26-${id.toUpperCase()}`, pk]);
      await q(`INSERT INTO "StaffPulse"(id,"userId","pulseId","linkedById","createdAt","unlinkedAt") VALUES ($1,$2,$3,'u_admin',now(),${unlinked ? 'now()' : 'NULL'})`, [`sp_${id}`, user, id]);
    }
  };

  before(async () => {
    url = assertSafeTestDatabase(TEST_URL!);
    process.env.DATABASE_URL = url.toString();
    process.env.SESSION_SECRET = 'integration-secret-integration-secret-123';
    delete process.env.OWNER_EMAIL;
    for (const k of ['error', 'log', 'warn', 'info'] as const) console[k] = () => {};
    db = await resetTeamDatabase(url);
    await seed();
    setRateLimitStoreForTests(null);
    await login('admin', 'k_admin@test.local');
    await login('staff', 'k_staff@test.local');
  });
  after(async () => {
    setRateLimitStoreForTests(null);
    await db?.end();
  });

  it('Todos: asistentes + equipo vinculado, sin duplicados ni cuentas sin pulsera o desvinculadas', async () => {
    const r = await list();
    assert.equal(r.total, 4);
    assert.deepEqual(names(r), ['Ana Admin', 'Ana Asistente', 'Beto Asistente', 'Saúl Staff']);
    assert.equal(new Set(r.rows.map((x: any) => `${x.kind}-${x.id}`)).size, 4);
    assert.equal(r.teamAvailable, true);
  });

  it('Solo asistentes: idéntico al listado de antes (sin equipo)', async () => {
    const r = await list('&kind=attendees');
    assert.deepEqual(names(r), ['Ana Asistente', 'Beto Asistente']);
    assert.ok(r.rows.every((x: any) => x.kind === 'ATTENDEE' && x.role === null && x.churchName === 'Iglesia Central'));
  });

  it('Solo equipo: Staff y Admin con rol, sin iglesia; id es el del User', async () => {
    const r = await list('&kind=team');
    assert.equal(r.total, 2);
    const by = Object.fromEntries(r.rows.map((x: any) => [x.fullName, x]));
    assert.equal(by['Ana Admin'].role, 'ADMIN');
    assert.equal(by['Saúl Staff'].role, 'STAFF');
    assert.equal(by['Ana Admin'].id, 'u_admin');
    assert.ok(r.rows.every((x: any) => x.kind === 'TEAM' && x.churchName === '' && x.zoneName === ''));
  });

  it('se combina con kit, aguas, búsqueda y paginación', async () => {
    assert.deepEqual(names(await list('&kind=team&packageId=k2')), ['Saúl Staff']);
    assert.deepEqual(names(await list('&packageId=k1')), ['Ana Admin', 'Ana Asistente']);
    assert.deepEqual(names(await list('&drinks=none')), ['Beto Asistente', 'Saúl Staff']);
    assert.deepEqual(names(await list('&kind=team&q=saul')), ['Saúl Staff']);
    const p = await list('&pageSize=10&page=0');
    assert.equal(p.total, 4);
    const tiny = await (await call(attendeesFn, '/api/admin/attendees?pageSize=10&page=99', 'admin')).json() as any;
    assert.equal(tiny.page, 0);
  });

  it('zona, presbiterio e iglesia solo devuelven asistentes (el equipo no tiene iglesia)', async () => {
    assert.deepEqual(names(await list('&churchId=c1')), ['Ana Asistente', 'Beto Asistente']);
    assert.equal((await list('&kind=team&zoneId=z1')).total, 0);
    assert.equal((await list('&presbyteryId=p1')).total, 2);
  });

  it('el estado de aguas del equipo refleja su pulsera', async () => {
    await q(`UPDATE "Pulse" SET "drinksUsed" = 3 WHERE id = 't1'`);
    assert.deepEqual(names(await list('&kind=team&drinks=exhausted')), ['Ana Admin']);
    assert.deepEqual(names(await list('&drinks=available')), ['Ana Asistente']);
    await q(`UPDATE "Pulse" SET "drinksUsed" = 0 WHERE id = 't1'`);
  });

  it('es solo lectura: no cambia canjes, saldos ni pulseras', async () => {
    const snap = async () => JSON.stringify([(await q(`SELECT id,"drinksUsed",status::text FROM "Pulse" ORDER BY id`)).rows, (await q(`SELECT count(*)::int n FROM "Redemption"`)).rows]);
    const before = await snap();
    for (const f of ['', '&kind=team', '&kind=attendees']) await list(f);
    assert.equal(await snap(), before);
  });

  it('permisos: sin sesión 401, Staff 403, y un valor de tipo inválido equivale a Todos', async () => {
    assert.equal((await call(attendeesFn, '/api/admin/attendees')).status, 401);
    assert.equal((await call(attendeesFn, '/api/admin/attendees', 'staff')).status, 403);
    assert.equal((await list('&kind=hola')).total, 4);
  });

  it('sin la migración 012: Todos muestra solo asistentes y avisa; Solo equipo queda vacío; Solo asistentes intacto', async () => {
    await db.end();
    db = await resetTeamDatabase(url, { with012: false });
    await seedWithout012();
    setRateLimitStoreForTests(null);
    await login('admin', 'k_admin@test.local');
    const all = await list();
    assert.equal(all.teamAvailable, false);
    assert.deepEqual(names(all), ['Ana Asistente']);
    const team = await list('&kind=team');
    assert.equal(team.total, 0);
    assert.equal(team.teamAvailable, false);
    const att = await list('&kind=attendees');
    assert.deepEqual(names(att), ['Ana Asistente']);
    assert.equal(att.teamAvailable, true);
  });

  async function seedWithout012() {
    const h = bcrypt.hashSync('Pass-word-1', 4);
    await q(`INSERT INTO "User"(id,email,name,role,active,"passwordHash","updatedAt") VALUES ('u_admin','k_admin@test.local','Ana Admin','ADMIN',true,$1,now())`, [h]);
    await q(`INSERT INTO "Zone"(id,name) VALUES ('z1','Zona 1')`);
    await q(`INSERT INTO "Presbytery"(id,name,"zoneId") VALUES ('p1','Presbiterio','z1')`);
    await q(`INSERT INTO "Church"(id,name,"presbyteryId") VALUES ('c1','Iglesia Central','p1')`);
    await q(`INSERT INTO "Package"(id,name,price,"includedDrinks","updatedAt") VALUES ('k1','Kit A',10000,3,now())`);
    await q(`INSERT INTO "Batch"(id,code,"packageId",quantity,"createdById") VALUES ('b1','LOTE-1','k1',0,'u_admin')`);
    await q(`INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","updatedAt") VALUES ('a1','Ana Asistente','19-21','c1',now())`);
    await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","batchId","attendeeId","updatedAt") VALUES ('p_a1','TOKa1XXXXXXXXXXXXXX','ACTIVE','AR26-A1','k1','b1','a1',now())`);
  }
});
