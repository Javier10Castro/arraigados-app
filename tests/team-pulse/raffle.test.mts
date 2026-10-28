import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import type pg from 'pg';
import { assertSafeTestDatabase, resetTeamDatabase } from './testdb.mts';
import { setRateLimitStoreForTests } from '../../server/rateLimit';
import loginFn from '../../netlify/functions/auth-login.mts';
import rafflesFn from '../../netlify/functions/admin-raffles.mts';
import raffleFn from '../../netlify/functions/admin-raffle.mts';
import drawFn from '../../netlify/functions/admin-raffle-draw.mts';
import cancelFn from '../../netlify/functions/admin-raffle-cancel.mts';
import publicFn from '../../netlify/functions/raffle-public.mts';

/** Bloque 4 · rifas por kit con sorteo en el servidor (migración 014). */
const TEST_URL = process.env.TEST_DATABASE_URL;
describe('rifas · PostgreSQL real', { skip: TEST_URL ? false : 'TEST_DATABASE_URL no definida' }, () => {
  let db: pg.Client;
  const cookies: Record<string, string> = {};
  const q = (t: string, v: unknown[] = []) => db.query(t, v);
  const one = async (t: string, v: unknown[] = []) => (await q(t, v)).rows[0];
  let ip = 0;
  type Fn = (r: Request, c: any) => Promise<Response>;
  const call = (fn: Fn, method: string, url: string, o: { who?: string; json?: unknown; params?: Record<string, string> } = {}) => {
    const headers: Record<string, string> = {};
    if (o.who) headers.cookie = cookies[o.who];
    let body: string | undefined;
    if (o.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(o.json);
    }
    return fn(new Request(`http://localhost${url}`, { method, headers, body }), { ip: `203.0.113.${(++ip % 250) + 1}`, params: o.params ?? {} });
  };
  const J = async (r: Response) => (await r.json()) as any;
  const create = (who: string | undefined, packageId: string, targetWinners: number, name?: string) =>
    call(rafflesFn, 'POST', '/api/admin/raffles', { who, json: { packageId, targetWinners, name } });
  const draw = (who: string | undefined, id: string, key: string, extra?: boolean) =>
    call(drawFn, 'POST', `/api/admin/raffles/${id}/draw`, { who, params: { id }, json: { drawKey: key, extra } });
  const detail = async (id: string) => J(await call(raffleFn, 'GET', `/api/admin/raffles/${id}`, { who: 'admin', params: { id } }));
  const pub = (id: string) => call(publicFn, 'GET', `/api/raffle/${id}`, { params: { id } });
  const winnersRows = async (id: string) => (await q(`SELECT * FROM "RaffleWinner" WHERE "raffleId"=$1 ORDER BY position`, [id])).rows;
  let seq = 0;
  const key = () => `draw-key-${String(++seq).padStart(6, '0')}`;

  before(async () => {
    const url = assertSafeTestDatabase(TEST_URL!);
    process.env.DATABASE_URL = url.toString();
    process.env.SESSION_SECRET = 'integration-secret-integration-secret-123';
    delete process.env.OWNER_EMAIL;
    for (const k of ['error', 'log', 'warn', 'info'] as const) console[k] = () => {};
    db = await resetTeamDatabase(url);
    const h = (p: string) => bcrypt.hashSync(p, 4);
    await q(`INSERT INTO "User"(id,email,name,role,active,"passwordHash","updatedAt") VALUES
      ('u_admin','javiercastro9912@gmail.com','Admin Rifas','ADMIN',true,$1,now()),('u_admin2','radmin2@test.local','Otro Admin','ADMIN',true,$1,now()),('u_staff','rstaff@test.local','Staff Rifas','STAFF',true,$1,now())`, [h('Pass-word-1')]);
    await q(`INSERT INTO "Zone"(id,name) VALUES ('z1','Zona 1')`);
    await q(`INSERT INTO "Presbytery"(id,name,"zoneId") VALUES ('p1','Presbiterio','z1')`);
    await q(`INSERT INTO "Church"(id,name,"presbyteryId") VALUES ('c1','Iglesia Central','p1')`);
    await q(`INSERT INTO "Package"(id,name,price,"includedDrinks","updatedAt") VALUES ('ka','Kit - A',10000,3,now()),('kb','Kit - B',15000,3,now()),('ke','Especial',20000,3,now())`);
    await q(`INSERT INTO "Batch"(id,code,"packageId",quantity,"createdById") VALUES ('b1','LOTE-1','ka',0,'u_admin')`);
    for (const [k, email] of [['admin', 'javiercastro9912@gmail.com'], ['admin2', 'radmin2@test.local'], ['staff', 'rstaff@test.local']] as const) {
      const r = await call(loginFn, 'POST', '/api/auth/login', { json: { email, password: 'Pass-word-1' } });
      cookies[k] = (r.headers.get('set-cookie') ?? '').split(';')[0];
      assert.ok(cookies[k], `login ${k}`);
    }
  });
  after(async () => {
    setRateLimitStoreForTests(null);
    await db?.end();
  });

  // Desde la migración 017 solo participan los INSCRITOS: aquí todos se inscriben a la rifa de su kit (las pruebas de
  // inscripción, incluida «quien no se inscribe no participa», están en raffleentry.test.mts).
  const addAttendee = async (id: string, name: string, kit: string, status = 'ACTIVE') => {
    await q(`INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","updatedAt") VALUES ($1,$2,'19-21','c1',now())`, [id, name]);
    await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","batchId","attendeeId","updatedAt") VALUES ($1,$2,$3::"PulseStatus",$4,$5,'b1',$6,now())`,
      [`pl_${id}`, `TOK${id}XXXXXXXXXXXXX`, status, `AR26-${id.toUpperCase()}`, kit, id]);
    await q(`INSERT INTO "RaffleEntry"(id,"attendeeId","packageId","pulseId","answerLiked","answerPlenary","answerLesson") VALUES ($1,$2,$3,$4,'Todo','Plenaria 1','Fe')`,
      [`re_${id}`, id, kit, `pl_${id}`]);
  };

  beforeEach(async () => {
    setRateLimitStoreForTests(null);
    await q(`DELETE FROM "RateLimit"`).catch(() => {});
    await q(`DELETE FROM "RaffleWinner"`);
    await q(`DELETE FROM "Raffle"`);
    await q(`DELETE FROM "AuditLog"`);
    await q(`DELETE FROM "StaffPulse"`);
    await q(`DELETE FROM "RaffleEntry"`);
    await q(`DELETE FROM "Pulse"`);
    await q(`DELETE FROM "Attendee"`);
    // Kit-A: 5 elegibles + 1 pulsera inválida + 1 sin reclamar; Kit-B: 3; Especial: 2; equipo en Kit-A y Kit-B
    for (let i = 1; i <= 5; i++) await addAttendee(`a${i}`, `Asistente A${i} Apellido`, 'ka');
    await addAttendee('a6', 'Asistente Inválido', 'ka', 'INVALIDATED');
    await addAttendee('a7', 'Asistente Sin Reclamar', 'ka', 'UNCLAIMED');
    for (let i = 1; i <= 3; i++) await addAttendee(`b${i}`, `Asistente B${i} Apellido`, 'kb');
    for (let i = 1; i <= 2; i++) await addAttendee(`e${i}`, `Asistente E${i} Apellido`, 'ke');
    for (const [id, pk, user] of [['tp1', 'ka', 'u_staff'], ['tp2', 'kb', 'u_admin']] as const) {
      await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","batchId","updatedAt") VALUES ($1,$2,'ACTIVE',$3,$4,'b1',now())`, [id, `TOK${id}XXXXXXXXXXXXX`, `AR26-${id.toUpperCase()}`, pk]);
      await q(`INSERT INTO "StaffPulse"(id,"userId","pulseId","linkedById","createdAt") VALUES ($1,$2,$3,'u_admin',now())`, [`sp_${id}`, user, id]);
    }
  });

  const open = async (pk: string, target: number) => {
    const r = await create('admin', pk, target);
    assert.equal(r.status, 201);
    return (await J(r)) as any;
  };

  it('autorización en el servidor: un Admin no autorizado recibe 403 en listar, crear, ver, editar y sortear', async () => {
    const r = await J(await create('admin', 'ke', 1));
    const id = r.id as string;
    const p = { who: 'admin2', params: { id } };
    assert.equal((await call(rafflesFn, 'GET', '/api/admin/raffles', { who: 'admin2' })).status, 403);
    assert.equal((await create('admin2', 'kb', 1)).status, 403);
    assert.equal((await call(raffleFn, 'GET', `/api/admin/raffles/${id}`, p)).status, 403);
    assert.equal((await call(raffleFn, 'PATCH', `/api/admin/raffles/${id}`, { ...p, json: { targetWinners: 2 } })).status, 403);
    assert.equal((await call(drawFn, 'POST', `/api/admin/raffles/${id}/draw`, { ...p, json: { drawKey: 'clave-no-autorizada-1' } })).status, 403);
    // Staff sigue sin acceso y la cuenta autorizada sí.
    assert.equal((await call(rafflesFn, 'GET', '/api/admin/raffles', { who: 'staff' })).status, 403);
    assert.equal((await call(rafflesFn, 'GET', '/api/admin/raffles', { who: 'admin' })).status, 200);
    // El proyector público no depende de la cuenta.
    assert.equal((await pub(id)).status, 200);
    // El 403 no dejó ganadores ni cambió la meta.
    const d = await detail(id);
    assert.equal((d.winners as unknown[]).length, 0);
  });

  it('Kit-A, Kit-B y Especial se separan; Staff/Admin y pulseras no activas quedan fuera', async () => {
    const a = await open('ka', 2);
    const b = await open('kb', 2);
    const e = await open('ke', 2);
    assert.equal(a.eligibleCount, 5); // sin la inválida, la sin reclamar ni el Staff con pulsera de equipo
    assert.equal(b.eligibleCount, 3); // sin el Admin con pulsera de equipo
    assert.equal(e.eligibleCount, 2);
    assert.equal(a.kitName, 'Kit - A');
    assert.equal(a.edition, 1);
  });

  it('solo Admin: sin sesión 401, Staff 403 en todo; un intento de Staff no sortea ni crea nada', async () => {
    const r = await open('ka', 2);
    for (const who of [undefined, 'staff']) {
      const want = who ? 403 : 401;
      assert.equal((await create(who, 'kb', 1)).status, want);
      assert.equal((await draw(who, r.id, key())).status, want);
      assert.equal((await call(rafflesFn, 'GET', '/api/admin/raffles', { who })).status, want);
      assert.equal((await call(raffleFn, 'GET', `/api/admin/raffles/${r.id}`, { who, params: { id: r.id } })).status, want);
      assert.equal((await call(raffleFn, 'PATCH', `/api/admin/raffles/${r.id}`, { who, params: { id: r.id }, json: { targetWinners: 9 } })).status, want);
    }
    assert.equal((await winnersRows(r.id)).length, 0);
    assert.equal((await one(`SELECT "targetWinners" t FROM "Raffle" WHERE id=$1`, [r.id])).t, 2);
    assert.equal((await one(`SELECT count(*)::int n FROM "Raffle"`)).n, 1);
  });

  it('sortea de uno en uno: el ganador es elegible, queda guardado y no se repite; al llegar al objetivo la rifa se completa', async () => {
    const r = await open('ka', 3);
    const seen = new Set<string>();
    for (let i = 1; i <= 3; i++) {
      const res = await draw('admin', r.id, key());
      assert.equal(res.status, 200);
      const d = await J(res);
      assert.equal(d.replay, false);
      assert.equal(d.winner.position, i);
      assert.equal(d.winner.extra, false);
      assert.match(d.winner.attendeeId, /^a[1-5]$/);
      assert.ok(!seen.has(d.winner.attendeeId));
      seen.add(d.winner.attendeeId);
      assert.equal(d.raffle.winnersCount, i);
      assert.equal(d.raffle.eligibleCount, 5 - i);
      assert.equal(d.raffle.status, i === 3 ? 'COMPLETED' : 'OPEN');
      assert.equal(d.winner.drawnById, 'u_admin');
    }
    // completada: sin «extra» ya no se sortea
    const blocked = await draw('admin', r.id, key());
    assert.equal(blocked.status, 409);
    assert.equal((await winnersRows(r.id)).length, 3);
  });

  it('sorteo extra: solo con la rifa completada y explícito; marca extra; sigue excluyendo ganadores; se agota con los elegibles', async () => {
    const r = await open('ke', 1); // 2 elegibles
    assert.equal((await draw('admin', r.id, key(), true)).status, 409); // extra antes de completar: no
    const first = await J(await draw('admin', r.id, key()));
    assert.equal(first.raffle.status, 'COMPLETED');
    assert.equal((await draw('admin', r.id, key())).status, 409); // sin extra: no
    const second = await J(await draw('admin', r.id, key(), true));
    assert.equal(second.winner.extra, true);
    assert.equal(second.winner.position, 2);
    assert.notEqual(second.winner.attendeeId, first.winner.attendeeId);
    // ya no quedan elegibles
    const none = await draw('admin', r.id, key(), true);
    assert.equal(none.status, 409);
    assert.match((await J(none)).error ?? (await none.clone().text()), /elegibles/);
    assert.equal((await winnersRows(r.id)).length, 2);
  });

  it('sin elegibles no se puede girar', async () => {
    await q(`UPDATE "Pulse" SET status='INVALIDATED' WHERE "packageId"='ke'`);
    const r = await open('ke', 1);
    assert.equal(r.eligibleCount, 0);
    assert.equal((await draw('admin', r.id, key())).status, 409);
    assert.equal((await winnersRows(r.id)).length, 0);
  });

  it('idempotencia: la misma llave devuelve el mismo ganador (replay) y no sortea otro', async () => {
    const r = await open('ka', 3);
    const k = key();
    const one1 = await J(await draw('admin', r.id, k));
    const two = await J(await draw('admin', r.id, k));
    assert.equal(two.replay, true);
    assert.equal(two.winner.attendeeId, one1.winner.attendeeId);
    assert.equal((await winnersRows(r.id)).length, 1);
  });

  it('concurrencia: 8 peticiones con la MISMA llave = 1 ganador; 8 con llaves distintas y objetivo 3 = exactamente 3 ganadores distintos', async () => {
    const r = await open('ka', 3);
    const k = key();
    const same = await Promise.all(Array.from({ length: 8 }, () => draw('admin', r.id, k)));
    assert.ok(same.every((x) => x.status === 200));
    assert.equal((await winnersRows(r.id)).length, 1);

    const rb = await open('kb', 3);
    const many = await Promise.all(Array.from({ length: 8 }, () => draw('admin', rb.id, key())));
    assert.equal(many.filter((x) => x.status === 200).length, 3);
    assert.equal(many.filter((x) => x.status === 409).length, 5);
    const rows = await winnersRows(rb.id);
    assert.equal(rows.length, 3);
    assert.equal(new Set(rows.map((w) => w.attendeeId)).size, 3);
    assert.deepEqual(rows.map((w) => w.position), [1, 2, 3]);
  });

  it('la base impide ganar dos veces en la misma rifa, repetir orden o repetir llave (aunque otra ruta fallara)', async () => {
    const r = await open('ka', 3);
    await draw('admin', r.id, key());
    const w = (await winnersRows(r.id))[0];
    const ins = (att: string, pos: number, k: string) =>
      q(`INSERT INTO "RaffleWinner"(id,"raffleId","attendeeId","position","winnerName","drawKey") VALUES ($1,$2,$3,$4,'x',$5)`, [`x${pos}${k}`, r.id, att, pos, k]);
    await assert.rejects(ins(w.attendeeId, 2, 'otra-llave-1'), { code: '23505' });
    await assert.rejects(ins('a5', 1, 'otra-llave-2'), { code: '23505' });
    await assert.rejects(ins('a5', 2, w.drawKey), { code: '23505' });
  });

  it('el ganador de una rifa puede participar en la edición siguiente; la anterior se conserva intacta', async () => {
    const r1 = await open('ke', 2);
    await draw('admin', r1.id, key());
    await draw('admin', r1.id, key());
    assert.equal((await detail(r1.id)).status, 'COMPLETED');
    const r2 = await open('ke', 1); // nueva edición del mismo kit
    assert.equal(r2.edition, 2);
    assert.equal(r2.eligibleCount, 2); // los 2 ganadores de la edición 1 vuelven a ser elegibles en la nueva
    assert.equal((await detail(r1.id)).winners.length, 2);
    const w = await J(await draw('admin', r2.id, key()));
    assert.ok(['e1', 'e2'].includes(w.winner.attendeeId));
    assert.equal((await detail(r1.id)).winners.length, 2); // el historial anterior no cambia
  });

  it('una sola rifa abierta por kit; objetivo inválido y kit inexistente se rechazan', async () => {
    await open('ka', 2);
    assert.equal((await create('admin', 'ka', 2)).status, 409);
    for (const t of [0, -1, 1.5, 501, '3', null]) assert.equal((await create('admin', 'kb', t as any)).status, 400, String(t));
    assert.equal((await create('admin', 'no-existe', 2)).status, 404);
    assert.equal((await one(`SELECT count(*)::int n FROM "Raffle"`)).n, 1);
  });

  it('objetivo configurable: sube mientras está abierta, nunca por debajo de lo ya sorteado; completada no se edita', async () => {
    const r = await open('ka', 2);
    await draw('admin', r.id, key());
    const patch = (n: unknown) => call(raffleFn, 'PATCH', `/api/admin/raffles/${r.id}`, { who: 'admin', params: { id: r.id }, json: { targetWinners: n } });
    assert.equal((await patch(1)).status, 400); // ya hay 1 ganador
    assert.equal((await patch(4)).status, 200);
    await draw('admin', r.id, key());
    await draw('admin', r.id, key());
    await draw('admin', r.id, key());
    assert.equal((await detail(r.id)).status, 'COMPLETED');
    assert.equal((await patch(9)).status, 409);
    assert.equal((await winnersRows(r.id)).length, 4);
  });

  it('se revalida al sortear: quien cambia de kit o pierde la pulsera deja de ser elegible', async () => {
    const r = await open('kb', 3);
    assert.equal(r.eligibleCount, 3);
    await q(`UPDATE "Pulse" SET "packageId"='ke' WHERE "attendeeId"='b1'`);
    await q(`UPDATE "Pulse" SET status='INVALIDATED' WHERE "attendeeId"='b2'`);
    const d = await J(await draw('admin', r.id, key()));
    assert.equal(d.winner.attendeeId, 'b3');
    assert.equal(d.raffle.eligibleCount, 0);
  });

  it('el historial persiste, con nombre al momento del sorteo, orden, fecha y quién sorteó', async () => {
    const r = await open('ka', 2);
    const d = await J(await draw('admin', r.id, key()));
    await q(`UPDATE "Attendee" SET "fullName"='Nombre Cambiado' WHERE id=$1`, [d.winner.attendeeId]);
    const h = await detail(r.id);
    assert.equal(h.winners.length, 1);
    assert.match(h.winners[0].winnerName, /^Asistente A\d Apellido$/);
    assert.equal(h.winners[0].drawnByName, 'Admin Rifas');
    assert.ok(!Number.isNaN(Date.parse(h.winners[0].drawnAt)));
    const list = await J(await call(rafflesFn, 'GET', '/api/admin/raffles', { who: 'admin' }));
    assert.equal(list.raffles[0].winnersCount, 1);
    assert.equal((await one(`SELECT count(*)::int n FROM "AuditLog" WHERE action='raffle.draw'`)).n, 1);
  });

  it('vista pública: no sortea al consultar, no expone ids, correos ni controles, y no acepta métodos de escritura', async () => {
    const r = await open('ka', 2);
    for (let i = 0; i < 6; i++) assert.equal((await pub(r.id)).status, 200);
    assert.equal((await winnersRows(r.id)).length, 0); // cargar/recargar la pantalla NUNCA sortea
    const d = await J(await draw('admin', r.id, key()));
    const p = await J(await pub(r.id));
    assert.deepEqual(Object.keys(p).sort(), ['edition', 'id', 'kitName', 'name', 'pool', 'remaining', 'status', 'targetWinners', 'winners', 'winnersCount', 'winningPosition']);
    assert.deepEqual(Object.keys(p.winners[0]).sort(), ['extra', 'name', 'position', 'winner']);
    assert.equal(p.winners[0].name, 'Asistente A.'); // nombre + inicial del apellido
    assert.match(d.winner.winnerName, /^Asistente A\d Apellido$/); // el Admin sí ve el completo
    assert.ok(!JSON.stringify(p).includes('Apellido'));
    assert.equal(p.remaining, 4);
    // pool: quienes siguen participando, solo «Nombre I.» (sin el que ya salió)
    assert.equal(p.pool.length, 4);
    assert.ok(p.pool.every((n: string) => /^Asistente A\.$/.test(n)));
    assert.equal(p.winnersCount, 1);
    const raw = JSON.stringify(p);
    assert.ok(!/@|qrToken|TOK|attendeeId|manualCode/.test(raw));
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await call(publicFn, m, `/api/raffle/${r.id}`, { params: { id: r.id }, json: {} })).status, 405);
    assert.equal((await pub('no-existe')).status, 404);
    // sigue igual tras «recargar»
    assert.deepEqual((await J(await pub(r.id))).winners, p.winners);
  });

  it('no existe forma de borrar o reiniciar: DELETE no está permitido en ningún endpoint de rifas', async () => {
    const r = await open('ka', 1);
    await draw('admin', r.id, key());
    assert.equal((await call(raffleFn, 'DELETE', `/api/admin/raffles/${r.id}`, { who: 'admin', params: { id: r.id } })).status, 405);
    assert.equal((await call(rafflesFn, 'DELETE', '/api/admin/raffles', { who: 'admin' })).status, 405);
    assert.equal((await call(drawFn, 'DELETE', `/api/admin/raffles/${r.id}/draw`, { who: 'admin', params: { id: r.id } })).status, 405);
    assert.equal((await winnersRows(r.id)).length, 1);
  });

  it('llave de sorteo inválida o faltante: 400', async () => {
    const r = await open('ka', 1);
    for (const k of ['', 'corta', 'con espacios!!', 'x'.repeat(65)]) assert.equal((await draw('admin', r.id, k)).status, 400, k);
    assert.equal((await call(drawFn, 'POST', `/api/admin/raffles/${r.id}/draw`, { who: 'admin', params: { id: r.id }, json: {} })).status, 400);
    assert.equal((await winnersRows(r.id)).length, 0);
  });

  /* ------------------------- cancelar rifa (migración 016) ------------------------- */
  const cancel = (who: string | undefined, id: string) => call(cancelFn, 'POST', `/api/admin/raffles/${id}/cancel`, { who, params: { id } });

  it('cancelar: Admin autorizado cancela una rifa abierta; queda quién y cuándo, con auditoría; ganadores e historial intactos', async () => {
    const r = await open('ka', 3);
    const w1 = (await J(await draw('admin', r.id, key()))).winner;
    const res = await cancel('admin', r.id);
    assert.equal(res.status, 200);
    const d = await J(res);
    assert.equal(d.status, 'CANCELLED');
    assert.equal(d.winnersCount, 1);
    assert.deepEqual(d.winners.map((w: any) => w.winnerName), [w1.winnerName]);
    const row = await one(`SELECT status, "cancelledAt", "cancelledById", "completedAt" FROM "Raffle" WHERE id=$1`, [r.id]);
    assert.equal(row.status, 'CANCELLED');
    assert.ok(row.cancelledAt);
    assert.equal(row.cancelledById, 'u_admin');
    assert.equal(row.completedAt, null);
    assert.equal((await winnersRows(r.id)).length, 1);
    const au = await one(`SELECT metadata FROM "AuditLog" WHERE action='raffle.cancel' AND "entityId"=$1`, [r.id]);
    assert.equal(au.metadata.winnersKept, 1);
  });

  it('cancelar: sin sesión 401, Staff 403, Admin no autorizado 403, id inválido/inexistente 404; nada cambia', async () => {
    const r = await open('ka', 2);
    assert.equal((await cancel(undefined, r.id)).status, 401);
    assert.equal((await cancel('staff', r.id)).status, 403);
    assert.equal((await cancel('admin2', r.id)).status, 403);
    assert.equal((await cancel('admin', 'no-existe')).status, 404);
    assert.equal((await cancel('admin', 'id con espacios')).status, 404);
    assert.equal((await call(cancelFn, 'GET', `/api/admin/raffles/${r.id}/cancel`, { who: 'admin', params: { id: r.id } })).status, 405);
    assert.equal((await one(`SELECT status FROM "Raffle" WHERE id=$1`, [r.id])).status, 'OPEN');
  });

  it('cancelar: una rifa completada no se cancela (409); una segunda cancelación tampoco (409) y no cambia fecha ni autor', async () => {
    const done = await open('kb', 1);
    await draw('admin', done.id, key());
    assert.equal((await cancel('admin', done.id)).status, 409);
    assert.equal((await one(`SELECT status FROM "Raffle" WHERE id=$1`, [done.id])).status, 'COMPLETED');
    const r = await open('ka', 2);
    assert.equal((await cancel('admin', r.id)).status, 200);
    const first = await one(`SELECT "cancelledAt" FROM "Raffle" WHERE id=$1`, [r.id]);
    assert.equal((await cancel('admin', r.id)).status, 409);
    assert.deepEqual(await one(`SELECT "cancelledAt" FROM "Raffle" WHERE id=$1`, [r.id]), first);
  });

  it('rifa cancelada: no se sortea (normal, extra ni con una llave nueva o repetida), no se edita y no se reabre; el historial queda', async () => {
    const r = await open('ka', 3);
    const k = key();
    const w1 = (await J(await draw('admin', r.id, k))).winner;
    assert.equal((await cancel('admin', r.id)).status, 200);
    for (const body of [[key(), false], [key(), true], [k, false]] as const) assert.equal((await draw('admin', r.id, body[0], body[1])).status, 409);
    const patch = await call(raffleFn, 'PATCH', `/api/admin/raffles/${r.id}`, { who: 'admin', params: { id: r.id }, json: { targetWinners: 9 } });
    assert.equal(patch.status, 409);
    assert.match((await J(patch)).error, /cancelada/);
    assert.equal((await winnersRows(r.id)).length, 1);
    const d = await detail(r.id);
    assert.equal(d.status, 'CANCELLED');
    assert.equal(d.targetWinners, 3);
    assert.equal(d.winners[0].winnerName, w1.winnerName);
    // no existe forma de reabrir: ningún método vuelve a OPEN
    for (const m of ['PUT', 'DELETE']) assert.equal((await call(cancelFn, m, `/api/admin/raffles/${r.id}/cancel`, { who: 'admin', params: { id: r.id } })).status, 405);
    assert.equal((await one(`SELECT status FROM "Raffle" WHERE id=$1`, [r.id])).status, 'CANCELLED');
  });

  it('cancelar: 8 solicitudes simultáneas = exactamente una cancelación (200) y siete 409; una sola auditoría', async () => {
    const r = await open('ka', 2);
    const res = await Promise.all(Array.from({ length: 8 }, () => cancel('admin', r.id)));
    assert.equal(res.filter((x) => x.status === 200).length, 1);
    assert.equal(res.filter((x) => x.status === 409).length, 7);
    assert.equal((await one(`SELECT count(*)::int n FROM "AuditLog" WHERE action='raffle.cancel' AND "entityId"=$1`, [r.id])).n, 1);
  });

  it('cancelar vs. sortear a la vez: nunca queda un ganador después de la cancelación y el estado final es coherente', async () => {
    const r = await open('ka', 5);
    const res = await Promise.all([cancel('admin', r.id), ...Array.from({ length: 5 }, () => draw('admin', r.id, key()))]);
    assert.equal(res[0].status, 200);
    const final = await one(`SELECT status, "cancelledAt" FROM "Raffle" WHERE id=$1`, [r.id]);
    assert.equal(final.status, 'CANCELLED');
    const n = (await winnersRows(r.id)).length;
    for (const x of res.slice(1)) assert.ok([200, 409].includes(x.status));
    assert.equal(res.slice(1).filter((x) => x.status === 200).length, n); // cada 200 es un ganador guardado, y ninguno posterior
    await draw('admin', r.id, key());
    assert.equal((await winnersRows(r.id)).length, n);
  });

  it('tras cancelar se puede abrir otra rifa del mismo kit (edición siguiente); la cancelada queda como historial', async () => {
    const a = await open('ka', 2);
    assert.equal((await create('admin', 'ka', 2)).status, 409); // mientras está abierta, no
    await cancel('admin', a.id);
    const b = await open('ka', 2);
    assert.equal(b.edition, 2);
    const l = await J(await call(rafflesFn, 'GET', '/api/admin/raffles', { who: 'admin' }));
    assert.deepEqual(l.raffles.filter((x: any) => x.packageId === 'ka').map((x: any) => x.status).sort(), ['CANCELLED', 'OPEN']);
    assert.equal((await draw('admin', b.id, key())).status, 200);
  });

  it('vista pública de una rifa cancelada: estado CANCELLED, ganadores como «Nombre I.», sin apellidos ni datos privados', async () => {
    const r = await open('ka', 3);
    await draw('admin', r.id, key());
    await cancel('admin', r.id);
    const p = await J(await pub(r.id));
    assert.equal(p.status, 'CANCELLED');
    assert.equal(p.winners.length, 1);
    assert.match(p.winners[0].name, /^Asistente A\.$/);
    assert.deepEqual(Object.keys(p).sort(), ['edition', 'id', 'kitName', 'name', 'pool', 'remaining', 'status', 'targetWinners', 'winners', 'winnersCount', 'winningPosition']);
    assert.ok(!/Apellido|@|qrToken|TOK|attendeeId|manualCode|cancelled/.test(JSON.stringify(p)));
    assert.equal((await draw(undefined, r.id, key())).status, 401); // sin sesión, ni la vista pública ni nadie sortea
  });

  it('sin la migración 016: cancelar responde 409 con mensaje claro (no 500), la rifa sigue abierta y todo lo demás funciona', async () => {
    const fs = await import('node:fs');
    const r = await open('ka', 2);
    await db.query(fs.readFileSync('docs/rollback/016_raffle_cancel_down.sql', 'utf8'));
    try {
      const res = await cancel('admin', r.id);
      assert.equal(res.status, 409);
      assert.match((await J(res)).error, /migración 016/);
      assert.equal((await one(`SELECT status FROM "Raffle" WHERE id=$1`, [r.id])).status, 'OPEN');
      assert.equal((await draw('admin', r.id, key())).status, 200); // sortear, listar y la vista pública no dependen de la 016
      assert.equal((await pub(r.id)).status, 200);
      assert.equal((await call(rafflesFn, 'GET', '/api/admin/raffles', { who: 'admin' })).status, 200);
    } finally {
      await db.query(fs.readFileSync('migrations/016_raffle_cancel.sql', 'utf8'));
    }
  });

  it('migración 016: idempotente, conserva rifas y ganadores existentes, rechaza estados/coherencias inválidas; el rollback aborta con rifas canceladas', async () => {
    const fs = await import('node:fs');
    const sql = fs.readFileSync('migrations/016_raffle_cancel.sql', 'utf8');
    const r = await open('ka', 2);
    await draw('admin', r.id, key());
    const before = await one(`SELECT count(*)::int n FROM "Raffle"`);
    await db.query(sql);
    await db.query(sql); // dos veces
    assert.deepEqual(await one(`SELECT count(*)::int n FROM "Raffle"`), before);
    assert.equal((await winnersRows(r.id)).length, 1);
    await assert.rejects(q(`UPDATE "Raffle" SET status='OTRO' WHERE id=$1`, [r.id]), { code: '23514' });
    await assert.rejects(q(`UPDATE "Raffle" SET status='CANCELLED' WHERE id=$1`, [r.id]), { code: '23514' }); // sin cancelledAt
    await assert.rejects(q(`UPDATE "Raffle" SET "cancelledAt"=now() WHERE id=$1`, [r.id]), { code: '23514' }); // cancelledAt sin CANCELLED
    await cancel('admin', r.id);
    await assert.rejects(db.query(fs.readFileSync('docs/rollback/016_raffle_cancel_down.sql', 'utf8')), /no se revierte la 016/);
    assert.equal((await one(`SELECT status FROM "Raffle" WHERE id=$1`, [r.id])).status, 'CANCELLED'); // el rollback no cambió nada
    assert.equal((await one(`SELECT count(*)::int n FROM pg_constraint WHERE conrelid='"Raffle"'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%'`)).n, 2);
  });

  it('sin la migración 014 el listado responde (available: false) y no falla', async () => {
    await q(`DROP TABLE "RaffleWinner"; DROP TABLE "Raffle";`);
    try {
      const l = await J(await call(rafflesFn, 'GET', '/api/admin/raffles', { who: 'admin' }));
      assert.equal(l.available, false);
      assert.equal(l.kits.length, 3);
      assert.equal((await create('admin', 'ka', 1)).status, 409);
      assert.equal((await pub('algo')).status, 404);
      // rutas con id: 409 con mensaje claro (antes: error 500)
      for (const r of [
        await call(raffleFn, 'GET', '/api/admin/raffles/x1', { who: 'admin', params: { id: 'x1' } }),
        await call(raffleFn, 'PATCH', '/api/admin/raffles/x1', { who: 'admin', params: { id: 'x1' }, json: { targetWinners: 2 } }),
        await draw('admin', 'x1', 'clave-sin-migracion-1'),
      ]) {
        assert.equal(r.status, 409);
        assert.match((await J(r)).error ?? '', /migración 014/);
      }
    } finally {
      await db.query((await import('node:fs')).readFileSync('migrations/014_raffles.sql', 'utf8'));
      await db.query((await import('node:fs')).readFileSync('migrations/016_raffle_cancel.sql', 'utf8'));
      await db.query((await import('node:fs')).readFileSync('migrations/017_raffle_entries.sql', 'utf8'));
    }
  });
});
