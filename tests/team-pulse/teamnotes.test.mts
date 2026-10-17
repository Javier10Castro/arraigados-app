import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import type pg from 'pg';
import { assertSafeTestDatabase, resetTeamDatabase } from './testdb.mts';
import { setRateLimitStoreForTests } from '../../server/rateLimit';
import { resetTeamNotesCacheForTests } from '../../server/notes';
import loginFn from '../../netlify/functions/auth-login.mts';
import notifFn from '../../netlify/functions/notifications.mts';
import notesFn from '../../netlify/functions/notes.mts';
import feedFn from '../../netlify/functions/notes-feed.mts';
import likeFn from '../../netlify/functions/notes-like.mts';
import likersFn from '../../netlify/functions/notes-likers.mts';
import adminNotesFn from '../../netlify/functions/admin-notes.mts';
import adminRetireFn from '../../netlify/functions/admin-note-retire.mts';

/** Notas y «me gusta» del equipo (Staff/Admin con pulsera vinculada), migración 015. */
const TEST_URL = process.env.TEST_DATABASE_URL;
describe('notas y likes del equipo · PostgreSQL real', { skip: TEST_URL ? false : 'TEST_DATABASE_URL no definida' }, () => {
  let db: pg.Client;
  const cookies: Record<string, string> = {};
  const q = (t: string, v: unknown[] = []) => db.query(t, v);
  let ip = 0;
  type Fn = (r: Request, c: any) => Promise<Response>;
  const call = (fn: Fn, method: string, url: string, o: { who?: string; token?: string; json?: unknown; params?: Record<string, string> } = {}) => {
    const headers: Record<string, string> = {};
    if (o.who) headers.cookie = cookies[o.who];
    if (o.token !== undefined) headers['x-pulse-token'] = o.token;
    let body: string | undefined;
    if (o.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(o.json);
    }
    return fn(new Request(`http://localhost${url}`, { method, headers, body }), { ip: `203.0.113.${(++ip % 250) + 1}`, params: o.params ?? {} });
  };
  const J = async (r: Response) => (await r.json()) as any;
  const TOK = { a1: 'AAAAAAAAAAAAAA01', a2: 'AAAAAAAAAAAAAA02' };
  const post = (o: { who?: string; token?: string }, text: string) => call(notesFn, 'POST', '/api/notes', { ...o, json: { text } });
  const feed = async (o: { who?: string; token?: string }) => (await J(await call(feedFn, 'GET', '/api/notes/feed', o))).notes as any[];
  const like = (o: { who?: string; token?: string }, id: string) => call(likeFn, 'POST', `/api/notes/${id}/like`, { ...o, params: { id } });
  const mine = async (o: { who?: string; token?: string }) => (await J(await call(notesFn, 'GET', '/api/notes', o))).notes as any[];

  before(async () => {
    const url = assertSafeTestDatabase(TEST_URL!);
    process.env.DATABASE_URL = url.toString();
    process.env.SESSION_SECRET = 'integration-secret-integration-secret-123';
    delete process.env.OWNER_EMAIL;
    for (const k of ['error', 'log', 'warn', 'info'] as const) console[k] = () => {};
    db = await resetTeamDatabase(url);
    const h = bcrypt.hashSync('Pass-word-1', 4);
    await q(`INSERT INTO "User"(id,email,name,role,active,"passwordHash","updatedAt") VALUES
      ('u_admin','nadmin@test.local','Ana Admin','ADMIN',true,$1,now()),('u_staff','nstaff@test.local','Saúl Staff','STAFF',true,$1,now()),('u_nolink','nolink@test.local','Sin Pulsera','STAFF',true,$1,now())`, [h]);
    await q(`INSERT INTO "Zone"(id,name) VALUES ('z1','Zona 1')`);
    await q(`INSERT INTO "Presbytery"(id,name,"zoneId") VALUES ('p1','Presbiterio','z1')`);
    await q(`INSERT INTO "Church"(id,name,"presbyteryId") VALUES ('c1','Iglesia Central','p1')`);
    await q(`INSERT INTO "Package"(id,name,price,"includedDrinks","updatedAt") VALUES ('k1','Kit',10000,3,now())`);
    await q(`INSERT INTO "Batch"(id,code,"packageId",quantity,"createdById") VALUES ('b1','LOTE-1','k1',0,'u_admin')`);
    for (const [k, email] of [['admin', 'nadmin@test.local'], ['staff', 'nstaff@test.local'], ['nolink', 'nolink@test.local']] as const) {
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
    resetTeamNotesCacheForTests();
    await q(`DELETE FROM "RateLimit"`).catch(() => {});
    await q(`DELETE FROM "AuditLog"`);
    await q(`DELETE FROM "NoteLike"`);
    await q(`DELETE FROM "Note"`);
    await q(`DELETE FROM "StaffPulse"`);
    await q(`DELETE FROM "Pulse"`);
    await q(`DELETE FROM "Attendee"`);
    for (const [id, name, tok] of [['at1', 'Ana Asistente López', TOK.a1], ['at2', 'Beto Asistente Ruiz', TOK.a2]] as const) {
      await q(`INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","updatedAt") VALUES ($1,$2,'19-21','c1',now())`, [id, name]);
      await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","batchId","attendeeId","updatedAt") VALUES ($1,$2,'ACTIVE',$3,'k1','b1',$4,now())`, [`pl_${id}`, tok, `AR26-${id.toUpperCase()}`, id]);
    }
    for (const [id, user] of [['tp1', 'u_staff'], ['tp2', 'u_admin']] as const) {
      await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","batchId","updatedAt") VALUES ($1,$2,'ACTIVE',$3,'k1','b1',now())`, [id, `TEAMTOK${id}XXXXXXXX`, `AR26-${id.toUpperCase()}`]);
      await q(`INSERT INTO "StaffPulse"(id,"userId","pulseId","linkedById","createdAt") VALUES ($1,$2,$3,'u_admin',now())`, [`sp_${id}`, user, id]);
    }
  });

  it('Staff y Admin con pulsera publican, reemplazan y quitan su nota igual que un asistente', async () => {
    for (const who of ['staff', 'admin']) {
      assert.equal((await post({ who }, 'Hola desde el equipo')).status, 200);
      assert.equal((await post({ who }, 'Segunda nota')).status, 200); // reemplaza a la anterior
      const notes = await mine({ who });
      // vigente = dura ~24 h (la reemplazada expira al instante); no depende de la zona horaria de quien corre la prueba
      assert.equal(notes.filter((n) => new Date(n.expiresAt).getTime() - new Date(n.createdAt).getTime() > 3_600_000).length, 1);
      assert.equal(notes.length, 2); // la anterior queda como historial
      const del = await J(await call(notesFn, 'DELETE', '/api/notes', { who }));
      assert.equal(del.removed, 1);
    }
    assert.equal((await q(`SELECT count(*)::int n FROM "Note" WHERE "attendeeId" IS NULL AND "userId" IS NOT NULL`)).rows[0].n, 4);
  });

  it('la nota del equipo la ve el asistente (primer nombre) y la del asistente la ve el equipo; cada quien no ve la propia', async () => {
    await post({ who: 'staff' }, 'Nota del staff');
    await post({ token: TOK.a1 }, 'Nota de Ana');
    const fa = await feed({ token: TOK.a1 });
    assert.deepEqual(fa.map((n) => [n.firstName, n.text]), [['Saúl', 'Nota del staff']]);
    assert.equal(fa[0].attendeeId, 'u_staff');
    const fs = await feed({ who: 'staff' });
    assert.deepEqual(fs.map((n) => n.firstName), ['Ana']);
    // el Admin ve las dos
    assert.deepEqual((await feed({ who: 'admin' })).map((n) => n.firstName).sort(), ['Ana', 'Saúl']);
  });

  it('likes en ambos sentidos: el dueño ve quién le dio like; no se puede dar like a la propia; alternar quita el like', async () => {
    const a = (await J(await post({ token: TOK.a1 }, 'Nota de Ana'))).note;
    const s = (await J(await post({ who: 'staff' }, 'Nota del staff'))).note;
    assert.equal((await J(await like({ who: 'staff' }, a.id))).liked, true);
    assert.equal((await J(await like({ token: TOK.a2 }, s.id))).liked, true);
    assert.equal((await like({ who: 'staff' }, s.id)).status, 403);
    assert.equal((await like({ token: TOK.a1 }, a.id)).status, 403);
    assert.equal((await mine({ token: TOK.a1 }))[0].likeCount, 1);
    assert.equal((await mine({ who: 'staff' }))[0].likeCount, 1);
    const likers = (await J(await call(likersFn, 'GET', '/api/notes/likers', { token: TOK.a1 }))).likers;
    assert.deepEqual(likers.map((l: any) => l.firstName), ['Saúl']);
    const likersS = (await J(await call(likersFn, 'GET', '/api/notes/likers', { who: 'staff' }))).likers;
    assert.deepEqual(likersS.map((l: any) => l.firstName), ['Beto']);
    assert.equal((await feed({ who: 'staff' })).find((n) => n.id === a.id).likedByMe, true);
    assert.equal((await J(await like({ who: 'staff' }, a.id))).liked, false); // alternar
    assert.equal((await mine({ token: TOK.a1 }))[0].likeCount, 0);
    // la base impide dos likes de la misma cuenta
    await like({ who: 'staff' }, a.id);
    await assert.rejects(q(`INSERT INTO "NoteLike"(id,"noteId","userId","createdAt") VALUES ('dup',$1,'u_staff',now())`, [a.id]), { code: '23505' });
  });

  it('campana del asistente: el like de una cuenta del equipo también se notifica (con su primer nombre)', async () => {
    const a = (await J(await post({ token: TOK.a1 }, 'Nota de Ana'))).note;
    const n0 = (await J(await call(notifFn, 'GET', '/api/notifications', { token: TOK.a1 }))).items.filter((i: any) => i.kind === 'like');
    assert.equal(n0.length, 0);
    assert.equal((await J(await like({ who: 'staff' }, a.id))).liked, true);
    let items = (await J(await call(notifFn, 'GET', '/api/notifications', { token: TOK.a1 }))).items.filter((i: any) => i.kind === 'like');
    assert.deepEqual(items.map((i: any) => [i.likerFirstName, i.count]), [['Saúl', 1]]);
    await like({ token: TOK.a2 }, a.id); // un asistente más: se agrupa y manda el like más reciente
    items = (await J(await call(notifFn, 'GET', '/api/notifications', { token: TOK.a1 }))).items.filter((i: any) => i.kind === 'like');
    assert.deepEqual(items.map((i: any) => [i.likerFirstName, i.count]), [['Beto', 2]]);
  });

  it('sin pulsera vinculada, sin sesión o con una cuenta distinta: 401 y no se escribe nada', async () => {
    assert.equal((await post({ who: 'nolink' }, 'x')).status, 401);
    assert.equal((await post({}, 'x')).status, 401);
    assert.equal((await post({ token: 'ZZZZZZZZZZZZZZ99' }, 'x')).status, 401);
    const n = (await J(await post({ token: TOK.a1 }, 'de Ana'))).note;
    assert.equal((await like({ who: 'nolink' }, n.id)).status, 401);
    assert.equal((await like({}, n.id)).status, 401);
    assert.equal((await q(`SELECT count(*)::int n FROM "Note"`)).rows[0].n, 1);
    // pulsera del equipo deshabilitada: ya no puede publicar
    await q(`UPDATE "Pulse" SET status='INVALIDATED' WHERE id='tp1'`);
    assert.equal((await post({ who: 'staff' }, 'x')).status, 401);
  });

  it('GET /api/notes del equipo: sesión válida sin actor de notas = 200 y []; sin sesión = 401; POST sigue rechazado', async () => {
    const get = (o: { who?: string; token?: string }) => call(notesFn, 'GET', '/api/notes', o);
    // Cuenta del equipo sin pulsera activa (con 015): 200 y lista vacía; publicar sigue dando 401.
    let r = await get({ who: 'nolink' });
    assert.equal(r.status, 200);
    assert.deepEqual((await J(r)).notes, []);
    assert.equal((await post({ who: 'nolink' }, 'x')).status, 401);
    // Sin cookie ni token, y token de asistente inválido: 401 como siempre.
    assert.equal((await get({})).status, 401);
    assert.equal((await get({ token: 'ZZZZZZZZZZZZZZ99' })).status, 401);
    // Con pulsera activa sigue viendo las propias (vacías aquí) con 200.
    assert.equal((await get({ who: 'staff' })).status, 200);
    // Sin la tabla StaffPulse (migración 012): 200 y [] (se renombra y se restaura; base de prueba).
    await q(`ALTER TABLE "StaffPulse" RENAME TO "StaffPulse_off"`);
    try {
      r = await get({ who: 'staff' });
      assert.equal(r.status, 200);
      assert.deepEqual((await J(r)).notes, []);
    } finally {
      await q(`ALTER TABLE "StaffPulse_off" RENAME TO "StaffPulse"`);
    }
  });

  it('el filtro de lenguaje y el largo máximo también aplican al equipo', async () => {
    assert.equal((await post({ who: 'staff' }, '')).status, 400);
    assert.equal((await post({ who: 'staff' }, 'x'.repeat(61))).status, 400);
  });

  it('Admin → Notas muestra las notas del equipo («Equipo») y se pueden retirar', async () => {
    await post({ token: TOK.a1 }, 'de Ana');
    const s = (await J(await post({ who: 'staff' }, 'del staff'))).note;
    const list = await J(await call(adminNotesFn, 'GET', '/api/admin/notes', { who: 'admin' }));
    assert.equal(list.total, 2);
    const row = list.rows.find((r: any) => r.id === s.id);
    assert.equal(row.attendeeName, 'Saúl Staff');
    assert.equal(row.churchName, 'Equipo');
    assert.equal(list.summary.authors, 2);
    const ret = await call(adminRetireFn, 'POST', `/api/admin/notes/${s.id}/retire`, { who: 'admin', params: { id: s.id }, json: { reason: 'prueba' } });
    assert.equal(ret.status, 200);
    assert.equal((await feed({ token: TOK.a1 })).length, 0);
  });

  it('sin la migración 015 los asistentes siguen igual y el equipo solo lee (publicar da un mensaje claro)', async () => {
    await post({ token: TOK.a2 }, 'de Beto');
    const a = (await J(await post({ token: TOK.a1 }, 'de Ana'))).note;
    await q(`DROP INDEX "NoteLike_noteId_userId_key"; ALTER TABLE "NoteLike" DROP CONSTRAINT notelike_one_author; ALTER TABLE "NoteLike" DROP COLUMN "userId";
             DELETE FROM "Note" WHERE "attendeeId" IS NULL; ALTER TABLE "Note" DROP CONSTRAINT note_one_author; ALTER TABLE "Note" DROP COLUMN "userId";`);
    try {
      resetTeamNotesCacheForTests();
      assert.deepEqual((await feed({ token: TOK.a1 })).map((n) => n.firstName), ['Beto']);
      assert.equal((await J(await like({ token: TOK.a1 }, (await feed({ token: TOK.a1 }))[0].id))).liked, true);
      assert.equal((await mine({ token: TOK.a2 }))[0].likeCount, 1);
      assert.equal((await feed({ who: 'staff' })).length, 2); // el equipo lee todas
      const g015 = await call(notesFn, 'GET', '/api/notes', { who: 'staff' }); // sin 015: 200 y vacío (antes: 401 -> «Tu nota no cargó»)
      assert.equal(g015.status, 200);
      assert.deepEqual((await J(g015)).notes, []);
      const r = await post({ who: 'staff' }, 'x');
      assert.equal(r.status, 400);
      assert.match((await J(r)).error, /no está habilitado/);
      assert.equal((await like({ who: 'staff' }, a.id)).status, 401);
      const list = await J(await call(adminNotesFn, 'GET', '/api/admin/notes', { who: 'admin' }));
      assert.equal(list.total, 2);
    } finally {
      await db.query((await import('node:fs')).readFileSync('migrations/015_team_notes.sql', 'utf8'));
      resetTeamNotesCacheForTests();
    }
  });
});
