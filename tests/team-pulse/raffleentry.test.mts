import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import type pg from 'pg';
import { assertSafeTestDatabase, resetTeamDatabase } from './testdb.mts';
import { setRateLimitStoreForTests } from '../../server/rateLimit';
import loginFn from '../../netlify/functions/auth-login.mts';
import rafflesFn from '../../netlify/functions/admin-raffles.mts';
import raffleFn from '../../netlify/functions/admin-raffle.mts';
import drawFn from '../../netlify/functions/admin-raffle-draw.mts';
import publicFn from '../../netlify/functions/raffle-public.mts';
import entryFn from '../../netlify/functions/raffle-entry.mts';
import adminEntriesFn from '../../netlify/functions/admin-raffle-entries.mts';
import adminEntryFn from '../../netlify/functions/admin-raffle-entry.mts';
import resetFn from '../../netlify/functions/admin-raffle-reset.mts';
import candidatesFn from '../../netlify/functions/admin-raffle-candidates.mts';
import { RAFFLE_PLENARIES, checkRaffleAnswers, prizeForKit } from '../../shared/raffle';

/** Inscripción a la rifa con 3 preguntas y «gana la salida #N» (migración 017). */
describe('rifa · preguntas y premios · sin base de datos', () => {
  it('cada kit con rifa tiene su premio; Inscripción Domingo no', () => {
    assert.equal(prizeForKit('Especial')?.title, 'Amazon Echo Pop');
    assert.equal(prizeForKit('Kit - B')?.title, 'Owala FreeSip');
    assert.equal(prizeForKit('Kit - A')?.title, 'Tarjeta de regalo Amazon');
    assert.equal(prizeForKit('kit-a')?.key, 'kita'); // tolera cambios menores de escritura
    assert.equal(prizeForKit('Inscripción Domingo'), null);
    assert.equal(prizeForKit(''), null);
  });
  it('plenarias del programa oficial; respuestas limpias y validadas', () => {
    assert.deepEqual(RAFFLE_PLENARIES, ['Plenaria 1 — Raíces profundas', 'Plenaria 2 — Sobreedificados en Él']);
    const ok = checkRaffleAnswers({ liked: '  La   alabanza\n\n', plenary: RAFFLE_PLENARIES[1], lesson: 'Estar arraigado en Cristo' });
    assert.deepEqual(ok, { ok: true, answers: { liked: 'La alabanza', plenary: RAFFLE_PLENARIES[1], lesson: 'Estar arraigado en Cristo' } });
    assert.equal(checkRaffleAnswers({ liked: 'ok', plenary: RAFFLE_PLENARIES[0], lesson: 'Mucho' }).ok, false); // muy corta
    assert.equal(checkRaffleAnswers({ liked: 'Todo', plenary: 'Plenaria 3', lesson: 'Mucho' }).ok, false);
    assert.equal(checkRaffleAnswers({ liked: 'Todo', plenary: RAFFLE_PLENARIES[0], lesson: 'x'.repeat(401) }).ok, false);
    assert.equal(checkRaffleAnswers({ liked: 7, plenary: RAFFLE_PLENARIES[0], lesson: 'Mucho' } as never).ok, false);
    assert.equal(checkRaffleAnswers(null).ok, false);
  });
});

const TEST_URL = process.env.TEST_DATABASE_URL;
describe('rifa · inscripción con preguntas · PostgreSQL real', { skip: TEST_URL ? false : 'TEST_DATABASE_URL no definida' }, () => {
  let db: pg.Client;
  const cookies: Record<string, string> = {};
  const q = (t: string, v: unknown[] = []) => db.query(t, v);
  const one = async (t: string, v: unknown[] = []) => (await q(t, v)).rows[0];
  let ip = 0;
  type Fn = (r: Request, c: any) => Promise<Response>;
  const call = (fn: Fn, method: string, url: string, o: { who?: string; token?: string; json?: unknown; params?: Record<string, string> } = {}) => {
    const headers: Record<string, string> = {};
    if (o.who) headers.cookie = cookies[o.who];
    if (o.token) headers['x-pulse-token'] = o.token;
    let body: string | undefined;
    if (o.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(o.json);
    }
    return fn(new Request(`http://localhost${url}`, { method, headers, body }), { ip: `198.51.100.${(++ip % 250) + 1}`, params: o.params ?? {} });
  };
  const J = async (r: Response) => (await r.json()) as any;
  const tok = (id: string) => `T${id}`.padEnd(16, 'X');
  const answers = { liked: 'La alabanza y convivir', plenary: RAFFLE_PLENARIES[0], lesson: 'Que hay que estar arraigados en Cristo' };
  const mine = (id: string) => call(entryFn, 'GET', '/api/raffle-entry', { token: tok(id) });
  const enter = (id: string, body: unknown = answers) => call(entryFn, 'POST', '/api/raffle-entry', { token: tok(id), json: body });
  const entries = (who = 'admin') => call(adminEntriesFn, 'GET', '/api/admin/raffle-entries', { who });
  const reset = (packageId: unknown, confirm: unknown, who: string | null = 'admin') =>
    call(resetFn, 'POST', '/api/admin/raffle-reset', { who: who ?? undefined, json: { packageId, confirm } });
  const candidates = (q: string, who: string | null = 'admin') =>
    call(candidatesFn, 'GET', `/api/admin/raffle-candidates?q=${encodeURIComponent(q)}`, { who: who ?? undefined });
  const addManual = (body: unknown, who: string | null = 'admin') =>
    call(adminEntriesFn, 'POST', '/api/admin/raffle-entries', { who: who ?? undefined, json: body });
  /** who: null = sin sesión. */
  const setRemoved = (pk: string, att: string, removed: unknown, who: string | null = 'admin') =>
    call(adminEntryFn, 'PATCH', `/api/admin/raffle-entries/${pk}/${att}`, { who: who ?? undefined, params: { packageId: pk, attendeeId: att }, json: { removed } });
  const setOpen = (open: unknown, who = 'admin') => call(adminEntriesFn, 'PATCH', '/api/admin/raffle-entries', { who, json: { open } });
  let seq = 0;
  const key = () => `entry-draw-${String(++seq).padStart(6, '0')}`;
  const draw = (id: string, extra?: boolean) => call(drawFn, 'POST', `/api/admin/raffles/${id}/draw`, { who: 'admin', params: { id }, json: { drawKey: key(), extra } });

  before(async () => {
    const url = assertSafeTestDatabase(TEST_URL!);
    process.env.DATABASE_URL = url.toString();
    process.env.SESSION_SECRET = 'integration-secret-integration-secret-123';
    delete process.env.OWNER_EMAIL;
    for (const k of ['error', 'log', 'warn', 'info'] as const) console[k] = () => {};
    db = await resetTeamDatabase(url);
    const h = (p: string) => bcrypt.hashSync(p, 4);
    await q(`INSERT INTO "User"(id,email,name,role,active,"passwordHash","updatedAt") VALUES
      ('u_admin','javiercastro9912@gmail.com','Admin Rifas','ADMIN',true,$1,now()),('u_admin2','eadmin2@test.local','Otro Admin','ADMIN',true,$1,now()),('u_staff','estaff@test.local','Staff','STAFF',true,$1,now())`, [h('Pass-word-1')]);
    await q(`INSERT INTO "Zone"(id,name) VALUES ('z1','Zona 1')`);
    await q(`INSERT INTO "Presbytery"(id,name,"zoneId") VALUES ('p1','Presbiterio','z1')`);
    await q(`INSERT INTO "Church"(id,name,"presbyteryId") VALUES ('c1','Iglesia Central','p1')`);
    await q(`INSERT INTO "Package"(id,name,price,"includedDrinks","updatedAt") VALUES
      ('ka','Kit - A',10000,0,now()),('kb','Kit - B',15000,3,now()),('ke','Especial',20000,3,now()),('kd','Inscripción Domingo',3000,0,now())`);
    await q(`INSERT INTO "Batch"(id,code,"packageId",quantity,"createdById") VALUES ('b1','LOTE-1','ka',0,'u_admin')`);
    for (const [k, email] of [['admin', 'javiercastro9912@gmail.com'], ['admin2', 'eadmin2@test.local'], ['staff', 'estaff@test.local']] as const) {
      const r = await call(loginFn, 'POST', '/api/auth/login', { json: { email, password: 'Pass-word-1' } });
      cookies[k] = (r.headers.get('set-cookie') ?? '').split(';')[0];
      assert.ok(cookies[k], `login ${k}`);
    }
  });
  after(async () => {
    setRateLimitStoreForTests(null);
    await db?.end();
  });

  const addAttendee = async (id: string, name: string, kit: string, status = 'ACTIVE') => {
    await q(`INSERT INTO "Attendee"(id,"fullName","ageRange","churchId","updatedAt") VALUES ($1,$2,'19-21','c1',now())`, [id, name]);
    await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","batchId","attendeeId","updatedAt") VALUES ($1,$2,$3::"PulseStatus",$4,$5,'b1',$6,now())`,
      [`pl_${id}`, tok(id), status, `AR26-${id.toUpperCase()}`, kit, id]);
  };

  beforeEach(async () => {
    setRateLimitStoreForTests(null);
    await q(`DELETE FROM "RateLimit"`).catch(() => {});
    await q(`DELETE FROM "RaffleWinner"`);
    await q(`DELETE FROM "Raffle"`);
    await q(`DELETE FROM "RaffleEntry"`);
    await q(`DELETE FROM "AuditLog"`);
    await q(`DELETE FROM "StaffPulse"`);
    await q(`DELETE FROM "Pulse"`);
    await q(`DELETE FROM "Attendee"`);
    for (let i = 1; i <= 4; i++) await addAttendee(`a${i}`, `Persona A${i} Apellido`, 'ka');
    for (let i = 1; i <= 2; i++) await addAttendee(`b${i}`, `Persona B${i} Apellido`, 'kb');
    await addAttendee('e1', 'Persona E1 Apellido', 'ke');
    await addAttendee('d1', 'Persona Domingo', 'kd');
    await addAttendee('x1', 'Persona Invalidada', 'ka', 'INVALIDATED');
    // Pulsera de equipo (sin asistente): no puede inscribirse.
    await q(`INSERT INTO "Pulse"(id,"qrToken",status,"manualCode","packageId","batchId","updatedAt") VALUES ('tp1',$1,'ACTIVE','AR26-TP1','ka','b1',now())`, [tok('tp1')]);
    await q(`INSERT INTO "StaffPulse"(id,"userId","pulseId","linkedById","createdAt") VALUES ('sp1','u_staff','tp1','u_admin',now())`);
  });

  it('GET: el asistente ve su kit, inscripciones abiertas y que aún no entra; sin token o con pulsera inválida/de equipo -> 401', async () => {
    const r = await mine('a1');
    assert.equal(r.status, 200);
    assert.deepEqual(await J(r), { available: true, kitName: 'Kit - A', hasRaffle: true, entriesOpen: true, entry: null, result: null });
    assert.equal((await call(entryFn, 'GET', '/api/raffle-entry')).status, 401);
    assert.equal((await mine('x1')).status, 401);
    assert.equal((await mine('tp1')).status, 401);
    assert.equal((await mine('noexiste')).status, 401);
    assert.equal((await call(entryFn, 'DELETE', '/api/raffle-entry', { token: tok('a1') })).status, 405);
  });

  it('POST: se inscribe una sola vez con respuestas limpias; repetir (o doble toque simultáneo) no cambia nada', async () => {
    const res = await enter('a1', { ...answers, liked: '  La alabanza   y convivir ' });
    assert.equal(res.status, 200);
    const d = await J(res);
    assert.equal(d.entry.liked, 'La alabanza y convivir');
    assert.equal(d.entry.plenary, RAFFLE_PLENARIES[0]);
    assert.ok(!Number.isNaN(Date.parse(d.entry.createdAt)));
    const again = await J(await enter('a1', { liked: 'Otra cosa distinta', plenary: RAFFLE_PLENARIES[1], lesson: 'Otra enseñanza' }));
    assert.equal(again.entry.liked, 'La alabanza y convivir'); // no se reescribe
    const many = await Promise.all(Array.from({ length: 8 }, () => enter('a2')));
    assert.ok(many.every((x) => x.status === 200));
    assert.equal((await one(`SELECT count(*)::int n FROM "RaffleEntry" WHERE "attendeeId"='a2'`)).n, 1);
    const row = await one(`SELECT "packageId", "pulseId" FROM "RaffleEntry" WHERE "attendeeId"='a1'`);
    assert.deepEqual(row, { packageId: 'ka', pulseId: 'pl_a1' }); // el kit sale de la pulsera
  });

  it('POST: respuestas inválidas -> 400 sin inscribir; JSON inválido -> 400; el kit lo decide la pulsera, no el cuerpo', async () => {
    for (const body of [{ ...answers, liked: 'ok' }, { ...answers, plenary: 'Mi favorita' }, { ...answers, lesson: '' }, {}, null]) {
      const r = await enter('a1', body);
      assert.equal(r.status, 400, JSON.stringify(body));
    }
    const bad = await entryFn(new Request('http://localhost/api/raffle-entry', { method: 'POST', headers: { 'x-pulse-token': tok('a1'), 'content-type': 'application/json' }, body: '{nope' }), { ip: '198.51.100.9', params: {} });
    assert.equal(bad.status, 400);
    assert.equal((await one(`SELECT count(*)::int n FROM "RaffleEntry"`)).n, 0);
    await enter('b1', { ...answers, packageId: 'ke', kit: 'Especial' });
    assert.equal((await one(`SELECT "packageId" FROM "RaffleEntry" WHERE "attendeeId"='b1'`)).packageId, 'kb');
  });

  it('kit sin rifa (Inscripción Domingo): hasRaffle false y POST 403; pulsera de equipo o inválida no se inscribe', async () => {
    const d = await J(await mine('d1'));
    assert.equal(d.hasRaffle, false);
    assert.equal((await enter('d1')).status, 403);
    assert.equal((await enter('tp1')).status, 401);
    assert.equal((await enter('x1')).status, 401);
    assert.equal((await one(`SELECT count(*)::int n FROM "RaffleEntry"`)).n, 0);
  });

  it('solo los inscritos participan: quien no responde nunca sale en el sorteo', async () => {
    await enter('a1');
    await enter('a3');
    const r = await J(await call(rafflesFn, 'POST', '/api/admin/raffles', { who: 'admin', json: { packageId: 'ka', winningPosition: 2 } }));
    assert.equal(r.eligibleCount, 2);
    const w1 = (await J(await draw(r.id))).winner.attendeeId;
    const w2 = (await J(await draw(r.id))).winner.attendeeId;
    assert.deepEqual([w1, w2].sort(), ['a1', 'a3']);
    assert.equal((await draw(r.id, true)).status, 409); // ya no queda ningún inscrito
    const b = await J(await call(rafflesFn, 'POST', '/api/admin/raffles', { who: 'admin', json: { packageId: 'kb', winningPosition: 1 } }));
    assert.equal(b.eligibleCount, 0);
    assert.equal((await draw(b.id)).status, 409);
  });

  it('inscripciones cerradas: nuevas -> 409; quien ya estaba sigue igual; solo cuentas autorizadas abren/cierran y queda auditado', async () => {
    await enter('a1');
    assert.equal((await setOpen(false, 'admin2')).status, 403);
    assert.equal((await setOpen(false, 'staff')).status, 403);
    assert.equal((await call(adminEntriesFn, 'PATCH', '/api/admin/raffle-entries', { json: { open: false } })).status, 401);
    assert.equal((await setOpen('no')).status, 400);
    const c = await setOpen(false);
    assert.equal(c.status, 200);
    assert.deepEqual(await J(c), { entriesOpen: false });
    assert.equal((await J(await mine('a2'))).entriesOpen, false);
    const late = await enter('a2');
    assert.equal(late.status, 409);
    assert.match((await J(late)).error, /cerraron/);
    assert.equal((await enter('a1')).status, 200); // ya inscrito: se devuelve lo que hay
    assert.equal((await one(`SELECT count(*)::int n FROM "AuditLog" WHERE "entityId"='raffleEntriesOpen'`)).n, 1);
    await setOpen(false); // sin cambio: no se escribe otra fila
    assert.equal((await one(`SELECT count(*)::int n FROM "AuditLog" WHERE "entityId"='raffleEntriesOpen'`)).n, 1);
    await setOpen(true);
    assert.equal((await enter('a2')).status, 200);
  });

  it('Admin → inscritos: por kit con premio (sin Domingo), con nombre, iglesia, respuestas y si sigue elegible; 403 a otros', async () => {
    await enter('a1');
    await enter('b2', { ...answers, plenary: RAFFLE_PLENARIES[1] });
    await q(`UPDATE "Pulse" SET status='INVALIDATED' WHERE "attendeeId"='a1'`);
    const r = await entries();
    assert.equal(r.status, 200);
    const d = await J(r);
    assert.equal(d.available, true);
    assert.equal(d.entriesOpen, true);
    assert.deepEqual(d.kits.map((k: any) => k.kitName), ['Especial', 'Kit - B', 'Kit - A']);
    const ka = d.kits.find((k: any) => k.packageId === 'ka');
    assert.equal(ka.entries.length, 1);
    assert.equal(ka.entries[0].fullName, 'Persona A1 Apellido');
    assert.equal(ka.entries[0].churchName, 'Iglesia Central');
    assert.equal(ka.entries[0].liked, answers.liked);
    assert.equal(ka.entries[0].eligible, false); // su pulsera se invalidó
    assert.equal(d.kits.find((k: any) => k.packageId === 'kb').entries[0].plenary, RAFFLE_PLENARIES[1]);
    assert.equal((await entries('admin2')).status, 403);
    assert.equal((await entries('staff')).status, 403);
    assert.equal((await call(adminEntriesFn, 'GET', '/api/admin/raffle-entries')).status, 401);
    assert.equal((await call(adminEntriesFn, 'DELETE', '/api/admin/raffle-entries', { who: 'admin' })).status, 405);
  });

  it('«gana la salida #3»: las 2 primeras no ganan, la 3.ª gana y completa la rifa; un extra también gana; el asistente ve el resultado', async () => {
    for (const id of ['a1', 'a2', 'a3', 'a4']) await enter(id);
    const res = await call(rafflesFn, 'POST', '/api/admin/raffles', { who: 'admin', json: { packageId: 'ka', winningPosition: 3 } });
    assert.equal(res.status, 201);
    const r = await J(res);
    assert.equal(r.winningPosition, 3);
    assert.equal(r.targetWinners, 3);
    assert.equal(r.name, 'Rifa Kit - A · Edición 1');
    const d1 = await J(await draw(r.id));
    assert.equal(d1.winner.winner, false);
    assert.equal(d1.raffle.status, 'OPEN');
    assert.equal((await J(await mine(d1.winner.attendeeId))).result, null); // aún no hay ganador
    const d2 = await J(await draw(r.id));
    const d3 = await J(await draw(r.id));
    assert.equal(d2.winner.winner, false);
    assert.equal(d3.winner.winner, true);
    assert.equal(d3.winner.position, 3);
    assert.equal(d3.raffle.status, 'COMPLETED');
    assert.equal((await draw(r.id)).status, 409);

    const p = await J(await call(publicFn, 'GET', `/api/raffle/${r.id}`, { params: { id: r.id } }));
    assert.equal(p.winningPosition, 3);
    assert.deepEqual(p.winners.map((w: any) => w.winner), [false, false, true]);

    const winnerView = await J(await mine(d3.winner.attendeeId));
    assert.equal(winnerView.result.youWon, true);
    assert.deepEqual(winnerView.result.winners, ['Persona A.']);
    const loserView = await J(await mine(d1.winner.attendeeId));
    assert.equal(loserView.result.youWon, false);
    assert.ok(!JSON.stringify(loserView.result).includes('Apellido'));

    const ex = await J(await draw(r.id, true));
    assert.equal(ex.winner.extra, true);
    assert.equal(ex.winner.winner, true);
    assert.equal((await J(await mine(ex.winner.attendeeId))).result.youWon, true);
    // Otro kit no ve este resultado
    assert.equal((await J(await mine('b1'))).result, null);
  });

  it('cambiar la salida ganadora: solo abierta y mayor a lo ya sorteado; sin posición ganadora (rifas viejas) todas ganan', async () => {
    for (const id of ['a1', 'a2', 'a3', 'a4']) await enter(id);
    const r = await J(await call(rafflesFn, 'POST', '/api/admin/raffles', { who: 'admin', json: { packageId: 'ka', winningPosition: 2 } }));
    await draw(r.id);
    const patch = (json: unknown) => call(raffleFn, 'PATCH', `/api/admin/raffles/${r.id}`, { who: 'admin', params: { id: r.id }, json });
    assert.equal((await patch({ winningPosition: 1 })).status, 400);
    assert.equal((await patch({ winningPosition: 0 })).status, 400);
    const ok = await J(await patch({ winningPosition: 3 }));
    assert.equal(ok.winningPosition, 3);
    assert.equal(ok.targetWinners, 3);
    for (const bad of [0, 501, 2.5, '2']) assert.equal((await call(rafflesFn, 'POST', '/api/admin/raffles', { who: 'admin', json: { packageId: 'kb', winningPosition: bad } })).status, 400);

    const legacy = await J(await call(rafflesFn, 'POST', '/api/admin/raffles', { who: 'admin', json: { packageId: 'ke', targetWinners: 1 } }));
    assert.equal(legacy.winningPosition, null);
    await enter('e1');
    const w = await J(await draw(legacy.id));
    assert.equal(w.winner.winner, true);
  });

  it('sin la migración 017: el asistente ve «no disponible», inscribirse da 409 y Admin avisa qué falta (nunca 500); el rollback aborta con inscripciones', async () => {
    await enter('a1');
    await assert.rejects(db.query(fs.readFileSync('docs/rollback/017_raffle_entries_down.sql', 'utf8')), /no se revierte la 017/);
    assert.equal((await one(`SELECT count(*)::int n FROM "RaffleEntry"`)).n, 1);
    await q(`DELETE FROM "RaffleEntry"`);
    const r = await J(await call(rafflesFn, 'POST', '/api/admin/raffles', { who: 'admin', json: { packageId: 'ka', winningPosition: 1 } }));
    await db.query(fs.readFileSync('docs/rollback/017_raffle_entries_down.sql', 'utf8'));
    try {
      const m = await mine('a2');
      assert.equal(m.status, 200);
      assert.equal((await J(m)).available, false);
      const e = await enter('a2');
      assert.equal(e.status, 409);
      assert.match((await J(e)).error, /no está disponible/);
      assert.equal((await J(await entries())).available, false);
      const list = await J(await call(rafflesFn, 'GET', '/api/admin/raffles', { who: 'admin' }));
      assert.deepEqual([list.available, list.missing], [false, '017']);
      const dr = await draw(r.id);
      assert.equal(dr.status, 409);
      assert.match((await J(dr)).error, /migración 017/);
      assert.equal((await call(rafflesFn, 'POST', '/api/admin/raffles', { who: 'admin', json: { packageId: 'kb', winningPosition: 1 } })).status, 409);
      assert.equal((await call(publicFn, 'GET', `/api/raffle/${r.id}`, { params: { id: r.id } })).status, 404);
    } finally {
      const sql = fs.readFileSync('migrations/017_raffle_entries.sql', 'utf8');
      await db.query(sql);
      await db.query(sql); // idempotente
      await db.query(fs.readFileSync('migrations/018_raffle_entry_remove.sql', 'utf8'));
      await db.query(fs.readFileSync('migrations/019_raffle_entry_manual.sql', 'utf8'));
    }
    assert.equal((await enter('a2')).status, 200);
  });
  /* ------------------------- quitar / restaurar (migración 018) ------------------------- */
  it('quitar: la persona deja de participar (no sale en el sorteo), ve que fue retirada y no puede volver a inscribirse', async () => {
    for (const id of ['a1', 'a2', 'a3']) await enter(id);
    const r = await setRemoved('ka', 'a2', true);
    assert.equal(r.status, 200);
    const list = await J(r);
    const a2 = list.kits.find((k: any) => k.packageId === 'ka').entries.find((e: any) => e.attendeeId === 'a2');
    assert.deepEqual([a2.removed, a2.eligible, a2.removedByName], [true, false, 'Admin Rifas']);
    assert.ok(!Number.isNaN(Date.parse(a2.removedAt)));
    assert.equal(a2.liked, answers.liked); // las respuestas se conservan
    const view = await J(await mine('a2'));
    assert.equal(view.entry.removed, true);
    const again = await J(await enter('a2', { ...answers, liked: 'Otra vez intentando' }));
    assert.equal(again.entry.removed, true); // no se reinscribe ni cambia respuestas
    assert.equal((await one(`SELECT count(*)::int n FROM "RaffleEntry" WHERE "attendeeId"='a2'`)).n, 1);
    const raffle = await J(await call(rafflesFn, 'POST', '/api/admin/raffles', { who: 'admin', json: { packageId: 'ka', winningPosition: 2 } }));
    assert.equal(raffle.eligibleCount, 2);
    const out = [(await J(await draw(raffle.id))).winner.attendeeId, (await J(await draw(raffle.id))).winner.attendeeId].sort();
    assert.deepEqual(out, ['a1', 'a3']); // a2 nunca sale
    assert.equal((await one(`SELECT count(*)::int n FROM "AuditLog" WHERE action='raffle.entry.remove'`)).n, 1);
  });

  it('restaurar: vuelve a participar; repetir el mismo estado no escribe nada; lo ya sorteado no cambia', async () => {
    await enter('a1');
    await enter('a2');
    await setRemoved('ka', 'a1', true);
    await setRemoved('ka', 'a1', true); // idempotente
    assert.equal((await one(`SELECT count(*)::int n FROM "AuditLog" WHERE action='raffle.entry.remove'`)).n, 1);
    const raffle = await J(await call(rafflesFn, 'POST', '/api/admin/raffles', { who: 'admin', json: { packageId: 'ka', winningPosition: 3 } }));
    assert.equal(raffle.eligibleCount, 1);
    const first = (await J(await draw(raffle.id))).winner.attendeeId;
    assert.equal(first, 'a2');
    const back = await J(await setRemoved('ka', 'a1', false));
    const a1 = back.kits.find((k: any) => k.packageId === 'ka').entries.find((e: any) => e.attendeeId === 'a1');
    assert.deepEqual([a1.removed, a1.eligible, a1.removedAt, a1.removedByName], [false, true, null, null]);
    assert.equal((await J(await mine('a1'))).entry.removed, false);
    assert.equal((await J(await call(raffleFn, 'GET', `/api/admin/raffles/${raffle.id}`, { who: 'admin', params: { id: raffle.id } }))).eligibleCount, 1);
    assert.equal((await J(await draw(raffle.id))).winner.attendeeId, 'a1');
    // quitar a alguien que YA salió no borra su salida
    await setRemoved('ka', 'a2', true);
    const d = await J(await call(raffleFn, 'GET', `/api/admin/raffles/${raffle.id}`, { who: 'admin', params: { id: raffle.id } }));
    assert.deepEqual(d.winners.map((w: any) => w.attendeeId), ['a2', 'a1']);
    assert.equal((await one(`SELECT count(*)::int n FROM "AuditLog" WHERE action='raffle.entry.restore'`)).n, 1);
  });

  it('quitar: solo cuentas autorizadas; valores, ids y métodos inválidos se rechazan sin cambiar nada', async () => {
    await enter('a1');
    assert.equal((await setRemoved('ka', 'a1', true, 'admin2')).status, 403);
    assert.equal((await setRemoved('ka', 'a1', true, 'staff')).status, 403);
    assert.equal((await setRemoved('ka', 'a1', true, null)).status, 401);
    for (const v of ['si', 1, null]) assert.equal((await setRemoved('ka', 'a1', v)).status, 400, String(v));
    assert.equal((await setRemoved('ka', 'a2', true)).status, 404); // a2 no está inscrito
    assert.equal((await setRemoved('kb', 'a1', true)).status, 404); // a1 no está en la rifa del Kit B
    assert.equal((await setRemoved('ka', 'id con espacios', true)).status, 404);
    for (const m of ['GET', 'DELETE', 'POST']) {
      assert.equal((await call(adminEntryFn, m, '/api/admin/raffle-entries/ka/a1', { who: 'admin', params: { packageId: 'ka', attendeeId: 'a1' } })).status, 405);
    }
    assert.equal((await one(`SELECT "removedAt" FROM "RaffleEntry" WHERE "attendeeId"='a1'`)).removedAt, null);
  });

  it('sin la migración 018: avisos claros (nunca 500); el rollback aborta si hay personas quitadas', async () => {
    await enter('a1');
    await setRemoved('ka', 'a1', true);
    await assert.rejects(db.query(fs.readFileSync('docs/rollback/018_raffle_entry_remove_down.sql', 'utf8')), /no se revierte la 018/);
    await setRemoved('ka', 'a1', false);
    await call(rafflesFn, 'POST', '/api/admin/raffles', { who: 'admin', json: { packageId: 'ka', winningPosition: 1 } });
    await db.query(fs.readFileSync('docs/rollback/018_raffle_entry_remove_down.sql', 'utf8'));
    try {
      assert.equal((await J(await mine('a1'))).available, false);
      assert.equal((await enter('a2')).status, 409);
      assert.equal((await J(await entries())).available, false);
      const list = await J(await call(rafflesFn, 'GET', '/api/admin/raffles', { who: 'admin' }));
      assert.deepEqual([list.available, list.missing], [false, '018']);
      const r = await setRemoved('ka', 'a1', true);
      assert.equal(r.status, 409);
      assert.match((await J(r)).error, /migración 018/);
    } finally {
      const sql = fs.readFileSync('migrations/018_raffle_entry_remove.sql', 'utf8');
      await db.query(sql);
      await db.query(sql); // idempotente
    }
    assert.equal((await J(await mine('a1'))).entry.removed, false);
  });
  /* ------------------------- reiniciar rifa ------------------------- */
  it('reiniciar un kit: borra sus rifas, salidas e inscripciones; los demás kits no cambian; todos pueden volver a entrar', async () => {
    for (const id of ['a1', 'a2', 'a3', 'b1']) await enter(id);
    await setRemoved('ka', 'a3', true);
    const ra = await J(await call(rafflesFn, 'POST', '/api/admin/raffles', { who: 'admin', json: { packageId: 'ka', winningPosition: 1 } }));
    await draw(ra.id); // Kit A completada
    const rb = await J(await call(rafflesFn, 'POST', '/api/admin/raffles', { who: 'admin', json: { packageId: 'kb', winningPosition: 1 } }));
    await draw(rb.id);
    const res = await reset('ka', ' borrar ');
    assert.equal(res.status, 200);
    assert.deepEqual(await J(res), { raffles: 1, winners: 1, entries: 3 });
    assert.equal((await one(`SELECT count(*)::int n FROM "Raffle" WHERE "packageId"='ka'`)).n, 0);
    assert.equal((await one(`SELECT count(*)::int n FROM "RaffleEntry" WHERE "packageId"='ka'`)).n, 0);
    // Kit B intacto
    assert.equal((await one(`SELECT count(*)::int n FROM "RaffleWinner" WHERE "raffleId"=$1`, [rb.id])).n, 1);
    assert.equal((await one(`SELECT count(*)::int n FROM "RaffleEntry" WHERE "packageId"='kb'`)).n, 1);
    // la persona quitada y las demás pueden volver a entrar; el resultado viejo ya no aparece
    for (const id of ['a1', 'a3']) {
      const v = await J(await mine(id));
      assert.deepEqual([v.entry, v.result], [null, null]);
      assert.equal((await enter(id)).status, 200);
    }
    assert.equal((await call(publicFn, 'GET', `/api/raffle/${ra.id}`, { params: { id: ra.id } })).status, 404);
    // se puede abrir una rifa nueva del kit (vuelve a la edición 1) y sortear con los nuevos inscritos
    const again = await J(await call(rafflesFn, 'POST', '/api/admin/raffles', { who: 'admin', json: { packageId: 'ka', winningPosition: 1 } }));
    assert.deepEqual([again.edition, again.eligibleCount], [1, 2]);
    const au = await one(`SELECT "entityId", metadata FROM "AuditLog" WHERE action='raffle.reset'`);
    assert.equal(au.entityId, 'ka');
    assert.deepEqual([au.metadata.raffles, au.metadata.winners, au.metadata.entries], [1, 1, 3]);
  });

  it('reiniciar todos: borra rifas e inscripciones de todos los kits', async () => {
    for (const id of ['a1', 'b1', 'e1']) await enter(id);
    const re = await J(await call(rafflesFn, 'POST', '/api/admin/raffles', { who: 'admin', json: { packageId: 'ke', winningPosition: 1 } }));
    await draw(re.id);
    const res = await J(await reset('ALL', 'BORRAR'));
    assert.deepEqual(res, { raffles: 1, winners: 1, entries: 3 });
    assert.equal((await one(`SELECT count(*)::int n FROM "RaffleEntry"`)).n, 0);
    assert.equal((await one(`SELECT count(*)::int n FROM "Raffle"`)).n, 0);
    assert.equal((await one(`SELECT "entityId" FROM "AuditLog" WHERE action='raffle.reset'`)).entityId, 'ALL');
  });

  it('reiniciar: sin la palabra BORRAR, sin permiso o con kit inválido no borra nada', async () => {
    await enter('a1');
    for (const c of ['', 'borra', 'SI', null, 1]) assert.equal((await reset('ka', c)).status, 400, String(c));
    assert.equal((await reset('ka', 'BORRAR', 'admin2')).status, 403);
    assert.equal((await reset('ka', 'BORRAR', 'staff')).status, 403);
    assert.equal((await reset('ka', 'BORRAR', null)).status, 401);
    assert.equal((await reset('no-existe', 'BORRAR')).status, 404);
    assert.equal((await reset('id con espacios', 'BORRAR')).status, 400);
    assert.equal((await reset(undefined, 'BORRAR')).status, 400);
    for (const m of ['GET', 'DELETE', 'PATCH']) assert.equal((await call(resetFn, m, '/api/admin/raffle-reset', { who: 'admin' })).status, 405);
    assert.equal((await one(`SELECT count(*)::int n FROM "RaffleEntry"`)).n, 1);
    assert.equal((await one(`SELECT count(*)::int n FROM "AuditLog" WHERE action='raffle.reset'`)).n, 0);
  });

  it('reiniciar mientras se sortea: nunca queda una salida sin su rifa ni una rifa a medias', async () => {
    for (const id of ['a1', 'a2', 'a3', 'a4']) await enter(id);
    const r = await J(await call(rafflesFn, 'POST', '/api/admin/raffles', { who: 'admin', json: { packageId: 'ka', winningPosition: 4 } }));
    const results = await Promise.all([reset('ka', 'BORRAR'), draw(r.id), draw(r.id), draw(r.id)]);
    assert.equal(results[0].status, 200);
    for (const x of results.slice(1)) assert.ok([200, 404, 409].includes(x.status), String(x.status));
    assert.equal((await one(`SELECT count(*)::int n FROM "RaffleWinner" w LEFT JOIN "Raffle" r ON r.id = w."raffleId" WHERE r.id IS NULL`)).n, 0);
    assert.equal((await one(`SELECT count(*)::int n FROM "Raffle" WHERE "packageId"='ka'`)).n, 0);
  });
  /* ------------------------- agregar a mano (migración 019) ------------------------- */
  it('buscar asistentes: por nombre o iglesia, sin acentos; solo pulseras activas de asistente; dice si ya están o si su kit no tiene rifa', async () => {
    await enter('a1');
    await enter('a2');
    await setRemoved('ka', 'a2', true);
    const r = await candidates('persona');
    assert.equal(r.status, 200);
    const list = await J(r);
    const by = Object.fromEntries(list.map((x: any) => [x.attendeeId, x]));
    assert.equal(by.a1.status, 'entered');
    assert.equal(by.a2.status, 'removed');
    assert.equal(by.a3.status, 'available');
    assert.equal(by.d1.status, 'no_raffle');
    assert.deepEqual([by.b1.kitName, by.b1.packageId, by.b1.churchName], ['Kit - B', 'kb', 'Iglesia Central']);
    assert.equal(by.x1, undefined); // pulsera invalidada
    assert.ok(!list.some((x: any) => x.attendeeId === null)); // la pulsera del equipo no tiene asistente
    assert.deepEqual((await J(await candidates('IGLESIA céntral'))).length, list.length); // iglesia y acentos
    assert.equal((await J(await candidates('persona e1'))).length, 1);
    assert.deepEqual(await J(await candidates('a')), []); // menos de 2 letras
    assert.equal((await candidates('persona', 'admin2')).status, 403);
    assert.equal((await candidates('persona', 'staff')).status, 403);
    assert.equal((await candidates('persona', null)).status, 401);
  });

  it('agregar: entra a la rifa del kit de SU pulsera, marcado como del equipo, aun con inscripciones cerradas; participa en el sorteo', async () => {
    await setOpen(false);
    const res = await addManual({ attendeeId: 'b1', packageId: 'ke' }); // el kit del cuerpo se ignora
    assert.equal(res.status, 201);
    const d = await J(res);
    const b1 = d.kits.find((k: any) => k.packageId === 'kb').entries.find((e: any) => e.attendeeId === 'b1');
    assert.deepEqual([b1.manual, b1.addedByName, b1.eligible, b1.liked, b1.plenary, b1.lesson], [true, 'Admin Rifas', true, '—', '—', '—']);
    assert.equal(d.kits.find((k: any) => k.packageId === 'ke').entries.length, 0);
    const mineB1 = await J(await mine('b1'));
    assert.deepEqual([mineB1.entry.manual, mineB1.entry.removed], [true, false]);
    // con respuestas opcionales
    await addManual({ attendeeId: 'a1', liked: '  La   alabanza ', plenary: RAFFLE_PLENARIES[1], lesson: '' });
    const a1 = await one(`SELECT "answerLiked" l, "answerPlenary" p, "answerLesson" s, manual, "addedById" FROM "RaffleEntry" WHERE "attendeeId"='a1'`);
    assert.deepEqual(a1, { l: 'La alabanza', p: RAFFLE_PLENARIES[1], s: '—', manual: true, addedById: 'u_admin' });
    const raffle = await J(await call(rafflesFn, 'POST', '/api/admin/raffles', { who: 'admin', json: { packageId: 'kb', winningPosition: 1 } }));
    assert.equal(raffle.eligibleCount, 1);
    assert.equal((await J(await draw(raffle.id))).winner.attendeeId, 'b1');
    assert.equal((await one(`SELECT count(*)::int n FROM "AuditLog" WHERE action='raffle.entry.add'`)).n, 2);
    // la app sigue marcando las inscripciones normales como no manuales
    await setOpen(true);
    await enter('a2');
    assert.equal((await J(await mine('a2'))).entry.manual, false);
  });

  it('agregar: rechaza duplicados, quitados, kits sin rifa, sin pulsera activa y datos inválidos; solo cuentas autorizadas', async () => {
    await enter('a1');
    await enter('a2');
    await setRemoved('ka', 'a2', true);
    const dup = await addManual({ attendeeId: 'a1' });
    assert.equal(dup.status, 409);
    assert.match((await J(dup)).error, /ya está/);
    const rem = await addManual({ attendeeId: 'a2' });
    assert.equal(rem.status, 409);
    assert.match((await J(rem)).error, /Restaurar/);
    assert.equal((await addManual({ attendeeId: 'd1' })).status, 400); // Inscripción Domingo
    assert.equal((await addManual({ attendeeId: 'x1' })).status, 404); // pulsera invalidada
    assert.equal((await addManual({ attendeeId: 'no-existe' })).status, 404);
    assert.equal((await addManual({})).status, 400);
    assert.equal((await addManual({ attendeeId: 'con espacios' })).status, 400);
    assert.equal((await addManual({ attendeeId: 'a3', plenary: 'Plenaria 9' })).status, 400);
    assert.equal((await addManual({ attendeeId: 'a3' }, 'admin2')).status, 403);
    assert.equal((await addManual({ attendeeId: 'a3' }, 'staff')).status, 403);
    assert.equal((await addManual({ attendeeId: 'a3' }, null)).status, 401);
    assert.equal((await one(`SELECT count(*)::int n FROM "RaffleEntry" WHERE manual`)).n, 0);
    // dos clics a la vez = una sola inscripción
    const both = await Promise.all([addManual({ attendeeId: 'a3' }), addManual({ attendeeId: 'a3' })]);
    assert.deepEqual(both.map((x) => x.status).sort(), [201, 409]);
    assert.equal((await one(`SELECT count(*)::int n FROM "RaffleEntry" WHERE "attendeeId"='a3'`)).n, 1);
  });

  it('sin la migración 019: avisos claros (nunca 500); el rollback aborta si hay personas agregadas por el equipo', async () => {
    await addManual({ attendeeId: 'a1' });
    await assert.rejects(db.query(fs.readFileSync('docs/rollback/019_raffle_entry_manual_down.sql', 'utf8')), /no se revierte la 019/);
    await q(`DELETE FROM "RaffleEntry"`);
    await db.query(fs.readFileSync('docs/rollback/019_raffle_entry_manual_down.sql', 'utf8'));
    try {
      assert.equal((await J(await mine('a1'))).available, false);
      assert.equal((await J(await entries())).available, false);
      const r = await addManual({ attendeeId: 'a1' });
      assert.equal(r.status, 409);
      assert.match((await J(r)).error, /migración 019/);
      assert.equal((await candidates('persona')).status, 200); // buscar no depende de la 019
    } finally {
      const sql = fs.readFileSync('migrations/019_raffle_entry_manual.sql', 'utf8');
      await db.query(sql);
      await db.query(sql); // idempotente
    }
    assert.equal((await addManual({ attendeeId: 'a1' })).status, 201);
  });
});
