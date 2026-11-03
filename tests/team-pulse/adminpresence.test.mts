import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import type pg from 'pg';
import { assertSafeTestDatabase, resetTeamDatabase } from './testdb.mts';
import { setRateLimitStoreForTests } from '../../server/rateLimit';
import { cleanPath } from '../../server/adminPresence';
import loginFn from '../../netlify/functions/auth-login.mts';
import presenceFn from '../../netlify/functions/admin-presence.mts';
import messagesFn from '../../netlify/functions/admin-messages.mts';

/** «Admin en línea» y mensajes entre Admin (migración 020). */
describe('admin en línea · ruta limpia · sin base de datos', () => {
  it('solo guarda rutas del panel, sin consulta ni ancla', () => {
    assert.equal(cleanPath('/admin/rifas'), '/admin/rifas');
    assert.equal(cleanPath('/admin/asistentes/abc-123?q=juan#x'), '/admin/asistentes/abc-123');
    assert.equal(cleanPath('/admin'), '/admin');
    assert.equal(cleanPath('https://evil.test/admin'), '/admin');
    assert.equal(cleanPath('/home'), '/admin');
    assert.equal(cleanPath('/admin/<script>'), '/admin');
    assert.equal(cleanPath(`/admin/${'x'.repeat(300)}`), '/admin');
    assert.equal(cleanPath(42), '/admin');
  });
});

const TEST_URL = process.env.TEST_DATABASE_URL;
describe('admin en línea y mensajes · PostgreSQL real', { skip: TEST_URL ? false : 'TEST_DATABASE_URL no definida' }, () => {
  let db: pg.Client;
  const cookies: Record<string, string> = {};
  const q = (t: string, v: unknown[] = []) => db.query(t, v);
  let ip = 0;
  type Fn = (r: Request, c: any) => Promise<Response>;
  const call = (fn: Fn, url: string, who: string | null, json?: unknown, params: Record<string, string> = {}, method = 'POST') => {
    const headers: Record<string, string> = {};
    if (who) headers.cookie = cookies[who];
    let body: string | undefined;
    if (json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(json);
    }
    return fn(new Request(`http://localhost${url}`, { method, headers, body }), { ip: `198.51.100.${(++ip % 250) + 1}`, params });
  };
  const J = async (r: Response) => (await r.json()) as any;
  const beat = (who: string | null, path: unknown = '/admin/dashboard') => call(presenceFn, '/api/admin/presence', who, { path });
  const send = (who: string | null, toUserId: unknown, body: unknown) => call(messagesFn, '/api/admin/messages', who, { toUserId, body });
  const read = (who: string, ids: unknown) => call(messagesFn, '/api/admin/messages/read', who, { ids }, { action: 'read' });
  const convs = (who: string | null) => call(messagesFn, '/api/admin/messages', who, undefined, {}, 'GET');
  const thread = (who: string | null, withId: string, before?: string) =>
    call(messagesFn, `/api/admin/messages?with=${encodeURIComponent(withId)}${before ? `&before=${encodeURIComponent(before)}` : ''}`, who, undefined, {}, 'GET');

  before(async () => {
    const url = assertSafeTestDatabase(TEST_URL!);
    process.env.DATABASE_URL = url.toString();
    process.env.SESSION_SECRET = 'integration-secret-integration-secret-123';
    delete process.env.OWNER_EMAIL;
    for (const k of ['error', 'log', 'warn', 'info'] as const) console[k] = () => {};
    db = await resetTeamDatabase(url);
    const h = bcrypt.hashSync('Pass-word-1', 4);
    await q(`INSERT INTO "User"(id,email,name,role,active,"passwordHash","updatedAt") VALUES
      ('u_a','pa@test.local','Arturo Sánchez','ADMIN',true,$1,now()),
      ('u_m','pm@test.local','Milca Mendoza','ADMIN',true,$1,now()),
      ('u_j','pj@test.local','Javier Castro','ADMIN',true,$1,now()),
      ('u_s','ps@test.local','Staff Puerta','STAFF',true,$1,now()),
      ('u_off','poff@test.local','Admin Inactivo','ADMIN',false,$1,now())`, [h]);
    for (const [k, email] of [['a', 'pa@test.local'], ['m', 'pm@test.local'], ['j', 'pj@test.local'], ['s', 'ps@test.local']] as const) {
      const r = await call(loginFn, '/api/auth/login', null, { email, password: 'Pass-word-1' });
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
    await q(`DELETE FROM "AdminMessage"`);
    await q(`DELETE FROM "AdminPresence"`);
  });

  it('solo Admin: sin sesión 401, Staff 403, GET 405', async () => {
    assert.equal((await beat(null)).status, 401);
    assert.equal((await beat('s')).status, 403);
    assert.equal((await send('s', 'u_a', 'hola')).status, 403);
    assert.equal((await call(presenceFn, '/api/admin/presence', 'a', undefined, {}, 'GET')).status, 405);
    assert.equal((await q(`SELECT count(*)::int AS n FROM "AdminPresence"`)).rows[0].n, 0);
  });

  it('el latido guarda una fila por cuenta y lista quién está en línea y en qué sección', async () => {
    let r = await J(await beat('a', '/admin/rifas?x=1'));
    assert.equal(r.available, true);
    assert.equal(r.onlineSec, 45);
    assert.deepEqual(r.online.map((x: any) => [x.name, x.path, x.me]), [['Arturo Sánchez', '/admin/rifas', true]]);
    await beat('m', '/admin/asistentes/abc');
    await beat('a', '/admin/dashboard'); // misma cuenta: actualiza, no duplica
    r = await J(await beat('j', '/admin/usuarios'));
    // Primero yo; luego por nombre.
    assert.deepEqual(r.online.map((x: any) => [x.name, x.path, x.me]), [
      ['Javier Castro', '/admin/usuarios', true],
      ['Arturo Sánchez', '/admin/dashboard', false],
      ['Milca Mendoza', '/admin/asistentes/abc', false],
    ]);
    assert.ok(r.online.every((x: any) => x.secondsAgo >= 0 && x.secondsAgo < 5 && /Z$/.test(x.lastSeen)));
    assert.equal((await q(`SELECT count(*)::int AS n FROM "AdminPresence"`)).rows[0].n, 3);
    // Ruta ajena al panel → '/admin'.
    r = await J(await beat('m', 'https://otro.sitio/robar'));
    assert.equal(r.online.find((x: any) => x.me).path, '/admin');
  });

  it('quien no late en 45 s ya no sale; una cuenta desactivada o que ya no es Admin tampoco', async () => {
    await beat('a');
    await beat('m');
    await q(`UPDATE "AdminPresence" SET "lastSeen" = "lastSeen" - interval '46 seconds' WHERE "userId" = 'u_m'`);
    let r = await J(await beat('j'));
    assert.deepEqual(r.online.map((x: any) => x.name).sort(), ['Arturo Sánchez', 'Javier Castro']);
    await q(`UPDATE "User" SET role = 'STAFF' WHERE id = 'u_a'`);
    r = await J(await beat('j'));
    assert.deepEqual(r.online.map((x: any) => x.name), ['Javier Castro']);
    await q(`UPDATE "User" SET role = 'ADMIN' WHERE id = 'u_a'`);
    await q(`INSERT INTO "AdminPresence"("userId","path","lastSeen") VALUES ('u_off','/admin/lotes', now() AT TIME ZONE 'utc')`);
    r = await J(await beat('j'));
    assert.ok(!r.online.some((x: any) => x.name === 'Admin Inactivo'));
  });

  it('mensajes: llegan en el siguiente latido del destinatario y se marcan leídos (solo los míos)', async () => {
    let res = await send('a', 'u_m', '  ¿Ya   abriste la rifa\n del Kit B?  ');
    assert.equal(res.status, 201);
    const sent = await J(res);
    assert.equal(sent.ok, true);
    assert.equal(sent.message.fromMe, true);
    assert.equal(sent.message.body, '¿Ya abriste la rifa del Kit B?');
    assert.equal(sent.message.readAt, null);
    assert.match(sent.message.createdAt, /Z$/);
    await send('j', 'u_m', 'Ya voy');
    // Al que manda no le llega nada.
    assert.deepEqual((await J(await beat('a'))).inbox, []);
    const inbox = (await J(await beat('m'))).inbox;
    assert.deepEqual(inbox.map((x: any) => [x.fromName, x.fromUserId, x.body]), [
      ['Arturo Sánchez', 'u_a', '¿Ya abriste la rifa del Kit B?'],
      ['Javier Castro', 'u_j', 'Ya voy'],
    ]);
    // Otra cuenta no puede marcar como leídos mensajes ajenos.
    assert.deepEqual(await J(await read('a', inbox.map((x: any) => x.id))), { read: 0 });
    assert.equal((await J(await beat('m'))).inbox.length, 2);
    assert.deepEqual(await J(await read('m', [inbox[0].id, 'no-existe', 7])), { read: 1 });
    assert.deepEqual((await J(await beat('m'))).inbox.map((x: any) => x.body), ['Ya voy']);
    assert.deepEqual(await J(await read('m', [inbox[0].id])), { read: 0 }); // ya estaba leído
    assert.deepEqual(await J(await read('m', 'nada')), { read: 0 });
  });

  it('historial tipo chat: conversaciones por persona, hilo en orden, abrir marca leídos y «Visto» para quien manda', async () => {
    assert.equal((await convs(null)).status, 401);
    assert.equal((await convs('s')).status, 403);
    assert.deepEqual(await J(await convs('a')), { available: true, conversations: [] });
    await send('a', 'u_m', 'Hola Milca');
    await q(`UPDATE "AdminMessage" SET "createdAt" = "createdAt" - interval '3 seconds'`);
    await send('m', 'u_a', 'Hola Arturo');
    await send('m', 'u_a', '¿Abro la rifa?');
    await q(`UPDATE "AdminMessage" SET "createdAt" = "createdAt" - interval '2 seconds' WHERE "fromUserId" = 'u_m'`);
    await send('j', 'u_a', 'Ya llegué');
    // Conversaciones de Arturo: Javier (la más reciente) y Milca, con no leídos y último mensaje.
    let c = (await J(await convs('a'))).conversations;
    assert.deepEqual(c.map((x: any) => [x.name, x.lastBody, x.lastFromMe, x.unread, x.canSend]), [
      ['Javier Castro', 'Ya llegué', false, 1, true],
      ['Milca Mendoza', '¿Abro la rifa?', false, 2, true],
    ]);
    // Abrir el hilo con Milca: todo en orden de tiempo, desde la vista de cada quien; marca leídos SOLO los de Milca.
    let t = await J(await thread('a', 'u_m'));
    assert.equal(t.available, true);
    assert.deepEqual(t.with, { userId: 'u_m', name: 'Milca Mendoza', canSend: true, online: null });
    assert.deepEqual(t.messages.map((x: any) => [x.fromMe, x.body]), [[true, 'Hola Milca'], [false, 'Hola Arturo'], [false, '¿Abro la rifa?']]);
    assert.equal(t.hasMore, false);
    c = (await J(await convs('a'))).conversations;
    assert.deepEqual(c.map((x: any) => x.unread), [1, 0]);
    assert.deepEqual((await J(await beat('a'))).inbox.map((x: any) => x.body), ['Ya llegué']);
    // Milca ve su lado: su mensaje ya «visto» por Arturo; el de Arturo aún sin leer hasta que ella abre el hilo.
    t = await J(await thread('m', 'u_a'));
    assert.deepEqual(t.messages.map((x: any) => [x.fromMe, x.body, x.readAt !== null]), [[false, 'Hola Milca', true], [true, 'Hola Arturo', true], [true, '¿Abro la rifa?', true]]);
    // En línea: el hilo dice dónde está la otra persona.
    t = await J(await thread('m', 'u_a'));
    assert.deepEqual(t.with.online.path, '/admin/dashboard');
    // Javier no ve la conversación entre Arturo y Milca.
    assert.deepEqual((await J(await convs('j'))).conversations.map((x: any) => x.name), ['Arturo Sánchez']);
    assert.deepEqual((await J(await thread('j', 'u_m'))).messages, []);
    // Hilo inválido o con uno mismo.
    assert.equal((await thread('a', 'u_a')).status, 400);
    assert.equal((await thread('a', 'u_nadie')).status, 404);
    assert.equal((await thread('a', 'u_m', 'ayer')).status, 400);
    // Con una cuenta que ya no es Admin: se ve el historial pero no se puede escribir.
    await q(`UPDATE "User" SET role = 'STAFF' WHERE id = 'u_j'`);
    t = await J(await thread('a', 'u_j'));
    assert.equal(t.with.canSend, false);
    assert.deepEqual(t.messages.map((x: any) => x.body), ['Ya llegué']);
    assert.equal((await J(await convs('a'))).conversations[0].canSend, false);
    await q(`UPDATE "User" SET role = 'ADMIN' WHERE id = 'u_j'`);
  });

  it('historial largo: páginas de 60 con «ver anteriores» (before)', async () => {
    await q(`INSERT INTO "AdminMessage"(id,"fromUserId","fromName","toUserId",body,"createdAt")
             SELECT 'h' || lpad(i::text, 3, '0'), CASE WHEN i % 2 = 0 THEN 'u_a' ELSE 'u_m' END, 'x',
                    CASE WHEN i % 2 = 0 THEN 'u_m' ELSE 'u_a' END, 'msg ' || i, (now() AT TIME ZONE 'utc') - make_interval(secs => 200 - i)
               FROM generate_series(1, 130) i`);
    const p1 = await J(await thread('a', 'u_m'));
    assert.equal(p1.messages.length, 60);
    assert.equal(p1.hasMore, true);
    assert.equal(p1.messages[0].body, 'msg 71');
    assert.equal(p1.messages[59].body, 'msg 130');
    const p2 = await J(await thread('a', 'u_m', p1.messages[0].createdAt));
    assert.deepEqual([p2.messages[0].body, p2.messages[59].body, p2.hasMore], ['msg 11', 'msg 70', true]);
    const p3 = await J(await thread('a', 'u_m', p2.messages[0].createdAt));
    assert.deepEqual([p3.messages.length, p3.messages[0].body, p3.hasMore], [10, 'msg 1', false]);
  });

  it('mensajes inválidos: a mí mismo, vacío, muy largo, a Staff, a cuenta inactiva o inexistente', async () => {
    const st = async (to: unknown, body: unknown) => (await send('a', to, body)).status;
    assert.equal(await st('u_a', 'hola'), 400);
    assert.equal(await st('u_m', '   '), 400);
    assert.equal(await st('u_m', 'x'.repeat(301)), 400);
    assert.equal(await st('u_m', 'x'.repeat(300)), 201);
    assert.equal(await st('u_s', 'hola'), 404);
    assert.equal(await st('u_off', 'hola'), 404);
    assert.equal(await st('u_nadie', 'hola'), 404);
    assert.equal(await st('', 'hola'), 400);
    assert.equal(await st({ id: 'u_m' }, 'hola'), 400);
    assert.equal((await q(`SELECT count(*)::int AS n FROM "AdminMessage"`)).rows[0].n, 1);
    assert.equal((await call(messagesFn, '/api/admin/messages/otra', 'a', { ids: [] }, { action: 'otra' })).status, 404);
  });

  it('límite de mensajes por cuenta (admin_msg: 30 cada 10 min)', async () => {
    for (let i = 0; i < 30; i++) assert.equal((await send('j', 'u_a', `m${i}`)).status, 201);
    assert.equal((await send('j', 'u_a', 'uno más')).status, 429);
    assert.equal((await send('m', 'u_a', 'otra cuenta sí puede')).status, 201);
    // El inbox se limita a 20 por respuesta.
    assert.equal((await J(await beat('a'))).inbox.length, 20);
  });

  it('borrar una cuenta borra su presencia y sus mensajes recibidos; los enviados conservan el nombre', async () => {
    await q(`INSERT INTO "User"(id,email,name,role,active,"passwordHash","updatedAt") VALUES ('u_tmp','tmp@test.local','Temporal','ADMIN',true,'x',now())`);
    await q(`INSERT INTO "AdminPresence"("userId","path") VALUES ('u_tmp','/admin')`);
    await send('a', 'u_tmp', 'para borrar');
    await q(`INSERT INTO "AdminMessage"(id,"fromUserId","fromName","toUserId",body) VALUES ('mtmp','u_tmp','Temporal','u_m','hola')`);
    await q(`DELETE FROM "User" WHERE id = 'u_tmp'`);
    assert.equal((await q(`SELECT count(*)::int AS n FROM "AdminPresence" WHERE "userId" = 'u_tmp'`)).rows[0].n, 0);
    const inbox = (await J(await beat('m'))).inbox;
    assert.deepEqual(inbox.map((x: any) => [x.fromUserId, x.fromName]), [[null, 'Temporal']]);
  });

  it('sin la migración 020: el latido responde available:false y mandar da 409 (nunca 500); la reversión y la reaplicación funcionan', async () => {
    await q(fs.readFileSync('docs/rollback/020_admin_presence_down.sql', 'utf8'));
    let res = await beat('a');
    assert.equal(res.status, 200);
    assert.deepEqual(await J(res), { available: false, onlineSec: 45, online: [], inbox: [] });
    res = await send('a', 'u_m', 'hola');
    assert.equal(res.status, 409);
    assert.match((await J(res)).error, /migración 020/);
    assert.deepEqual(await J(await read('a', ['x'])), { read: 0 });
    assert.deepEqual(await J(await convs('a')), { available: false, conversations: [] });
    assert.equal((await thread('a', 'u_m')).status, 409);
    // Reaplicar dos veces (idempotente).
    const up = fs.readFileSync('migrations/020_admin_presence.sql', 'utf8');
    await q(up);
    await q(up);
    assert.equal((await J(await beat('a'))).available, true);
  });
});
