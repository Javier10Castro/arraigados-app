import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import type pg from 'pg';
import { assertSafeTestDatabase, resetTeamDatabase } from './testdb.mts';
import { setRateLimitStoreForTests } from '../../server/rateLimit';
import loginFn from '../../netlify/functions/auth-login.mts';
import secretoFn from '../../netlify/functions/admin-secreto.mts';

/** Admin -> Secreto: listas "Nombre - Iglesia" por kit en .txt. Solo cuenta propietaria; solo lectura. */
const TEST_URL = process.env.TEST_DATABASE_URL;
describe('Secreto · listas por kit · PostgreSQL real', { skip: TEST_URL ? false : 'TEST_DATABASE_URL no definida' }, () => {
  let db: pg.Client;
  const cookies: Record<string, string> = {};
  const q = (t: string, v: unknown[] = []) => db.query(t, v);
  let ip = 0;
  const ctx = () => ({ ip: `203.0.113.${(++ip % 250) + 1}`, params: {} });
  const get = (kit: string, who?: string) =>
    secretoFn(new Request(`http://localhost/api/admin/secreto?kit=${kit}`, { headers: who ? { cookie: cookies[who] } : {} }), ctx() as any) as Promise<Response>;
  const login = async (k: string, email: string) => {
    const r = (await loginFn(new Request('http://localhost/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Pass-word-1' }) }), ctx() as any)) as Response;
    cookies[k] = (r.headers.get('set-cookie') ?? '').split(';')[0];
    assert.ok(cookies[k], `login ${k}`);
  };

  before(async () => {
    const url = assertSafeTestDatabase(TEST_URL!);
    process.env.DATABASE_URL = url.toString();
    process.env.SESSION_SECRET = 'integration-secret-integration-secret-123';
    process.env.OWNER_EMAIL = 'k_owner@test.local';
    for (const k of ['error', 'log', 'warn', 'info'] as const) console[k] = () => {};
    db = await resetTeamDatabase(url);
    const h = bcrypt.hashSync('Pass-word-1', 4);
    await q(`INSERT INTO "User"(id,email,name,role,active,"passwordHash","updatedAt") VALUES
      ('u_owner','k_owner@test.local','Dueño','ADMIN',true,$1,now()),('u_admin','k_admin@test.local','Otro Admin','ADMIN',true,$1,now()),
      ('u_staff','k_staff@test.local','Staff','STAFF',true,$1,now())`, [h]);
    await q(`INSERT INTO "Zone"(id,name) VALUES ('z1','Zona 1')`);
    await q(`INSERT INTO "Presbytery"(id,name,"zoneId") VALUES ('p1','Presbiterio','z1')`);
    await q(`INSERT INTO "Church"(id,name,"presbyteryId") VALUES ('c1','12va IAFCJ','p1'),('c2','5ta  Iglesia Tj','p1')`);
    await q(`INSERT INTO "Package"(id,name,price,"includedDrinks","updatedAt") VALUES ('ka','Kit - A',10000,0,now()),('kb','Kit B',15000,3,now()),('ke','Especial',20000,3,now()),('kx','Kit - AA',1,0,now())`);
    await q(`INSERT INTO "Batch"(id,code,"packageId",quantity,"createdById") VALUES ('b1','LOTE-1','ka',0,'u_owner')`);
    const rows: [string, string, string, string, string][] = [
      ['a1', 'Zoe  Álvarez ', 'c1', 'ka', 'ACTIVE'], ['a2', 'Ana Pérez', 'c2', 'ka', 'ACTIVE'], ['a3', 'Inactivo Uno', 'c1', 'ka', 'INVALIDATED'],
      ['a4', 'Beto Bravo', 'c1', 'kb', 'ACTIVE'], ['a5', 'Eva Especial', 'c2', 'ke', 'ACTIVE'], ['a6', 'Otro Kit', 'c1', 'kx', 'ACTIVE'],
    ];
    for (const [id, name, ch, pk, st] of rows) {
      await q(`INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","updatedAt") VALUES ($1,$2,'19-21',$3,now())`, [id, name, ch]);
      await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","batchId","attendeeId","updatedAt") VALUES ($1,$2,$3::"PulseStatus",$4,$5,'b1',$6,now())`, [`p_${id}`, `TOK${id}XXXXXXXXXXXXXX`, st, `AR26-${id.toUpperCase()}`, pk, id]);
    }
    // Pulsera de equipo en Kit A: no debe aparecer.
    await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","batchId","updatedAt") VALUES ('t1','TOKt1XXXXXXXXXXXXXX','ACTIVE','AR26-T1','ka','b1',now())`);
    await q(`INSERT INTO "StaffPulse"(id,"userId","pulseId","linkedById","createdAt") VALUES ('sp1','u_staff','t1','u_owner',now())`);
    setRateLimitStoreForTests(null);
    await login('owner', 'k_owner@test.local');
    await login('admin', 'k_admin@test.local');
    await login('staff', 'k_staff@test.local');
  });
  after(async () => {
    delete process.env.OWNER_EMAIL;
    setRateLimitStoreForTests(null);
    await db?.end();
  });

  it('Kit A: "Nombre - Iglesia", ordenado, espacios limpios; sin liberadas, sin equipo, sin "Kit - AA"', async () => {
    const r = await get('a', 'owner');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /^text\/plain/);
    assert.match(r.headers.get('content-disposition') ?? '', /attachment; filename="lista-a-\d{12}\.txt"/);
    assert.equal(await r.text(), 'Ana Pérez - 5ta Iglesia Tj\r\nZoe Álvarez - 12va IAFCJ\r\n');
  });
  it('Kit B y Kit Especial', async () => {
    assert.equal(await (await get('b', 'owner')).text(), 'Beto Bravo - 12va IAFCJ\r\n');
    assert.equal(await (await get('especial', 'owner')).text(), 'Eva Especial - 5ta Iglesia Tj\r\n');
  });
  it('Solo la cuenta propietaria: otro Admin 403, Staff 403, sin sesión 401; ninguno recibe datos', async () => {
    for (const [who, status] of [['admin', 403], ['staff', 403], [undefined, 401]] as const) {
      const r = await get('a', who);
      assert.equal(r.status, status, String(who));
      assert.ok(!(await r.text()).includes('Pérez'));
    }
  });
  it('Kit inválido 400; kit sin asistentes 404 con mensaje; solo GET', async () => {
    assert.equal((await get('zzz', 'owner')).status, 400);
    await q(`UPDATE "Pulse" SET status='INVALIDATED' WHERE id='p_a5'`);
    const r = await get('especial', 'owner');
    assert.equal(r.status, 404);
    assert.match(((await r.json()) as any).error, /Kit Especial/);
    const post = (await secretoFn(new Request('http://localhost/api/admin/secreto?kit=a', { method: 'POST', headers: { cookie: cookies.owner } }), ctx() as any)) as Response;
    assert.equal(post.status, 405);
  });
  it('Solo lectura: no cambia ninguna tabla', async () => {
    const n = async () => (await q(`SELECT (SELECT count(*) FROM "Attendee")+(SELECT count(*) FROM "Pulse")+(SELECT count(*) FROM "AuditLog") AS n`)).rows[0].n;
    const before = await n();
    await get('a', 'owner');
    await get('b', 'owner');
    assert.equal(await n(), before);
  });
});
