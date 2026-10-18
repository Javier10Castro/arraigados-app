// npm run db:lote-domingo                      -> SOLO MUESTRA (no escribe nada) qué pulseras sin registrar pasarían al kit del domingo
// npm run db:lote-domingo -- --aplicar         -> las pasa a un lote nuevo del kit "Inscripción Domingo" (pide escribir SI)
// npm run db:lote-domingo -- --deshacer CODIGO -> devuelve a sus lotes originales las pulseras de ese lote que SIGAN sin registrar
//
// Contexto (18 oct 2026): el proceso de venta se repite el domingo con las pulseras ya impresas que no se reclamaron.
// Cuota de inscripción $30, sin beneficios ni aguas. El precio/aguas/beneficios viven en el KIT, no en la pulsera, y la
// pulsera impresa no dice el kit: se reutiliza tal cual (mismo QR y código), solo cambia de lote y de kit.
//
// Qué hace (todo en UNA transacción; si algo falla no cambia nada):
//   · crea el kit "Inscripción Domingo" ($30.00, 0 aguas) si no existe; si ya existe con otro precio/aguas se detiene;
//   · crea un lote nuevo (DOMINGO-1, DOMINGO-2…) de ese kit;
//   · mueve ahí las pulseras con status UNCLAIMED (sin dueño) de los demás lotes. NO toca pulseras registradas (ACTIVE),
//     invalidadas, ni las de lotes CANCELADO; no cambia QR, códigos, asistentes, canjes ni nada más;
//   · deja una entrada de bitácora "batch.reuse" con de qué lote salió cada pulsera (para poder deshacerlo).
// ADVERTENCIA: toda pulsera sin registrar se considera sobrante. Si alguna ya se vendió pero su dueño aún no se registra,
// pasaría al kit del domingo (sin aguas ni beneficios). Revisa la vista previa antes de aplicar.
import { connect, ask } from './_db.mjs';
import { randomBytes } from 'node:crypto';

const KIT_NAME = 'Inscripción Domingo';
const KIT_PRICE = 3000; // centavos: $30.00
const KIT_DRINKS = 0;
const BATCH_PREFIX = 'DOMINGO-';

const args = process.argv.slice(2);
const apply = args.includes('--aplicar');
const undoIdx = args.indexOf('--deshacer');
const undoCode = undoIdx >= 0 ? String(args[undoIdx + 1] ?? '').trim() : '';
const ok = args.every((x, k) => x === '--aplicar' || x === '--deshacer' || (k > 0 && args[k - 1] === '--deshacer'));
if (!ok || (undoIdx >= 0 && (!undoCode || apply))) {
  console.error('Uso: npm run db:lote-domingo [-- --aplicar]   |   npm run db:lote-domingo -- --deshacer DOMINGO-1');
  process.exit(1);
}

const newId = () => 'c' + Array.from(randomBytes(24), (b) => '0123456789abcdefghijklmnopqrstuvwxyz'[b % 36]).join('');
const NOW = `(now() AT TIME ZONE 'UTC')`;
const { client, host, database } = connect();
await client.connect();

async function actorId() {
  const owner = (process.env.OWNER_EMAIL || 'javiercastro9912@gmail.com').trim().toLowerCase();
  const a = (await client.query(`SELECT id FROM "User" WHERE lower(email) = $1 AND role::text = 'ADMIN'`, [owner])).rows[0];
  if (!a) {
    console.error('✖ No encontré la cuenta propietaria (Admin) para dejarla como autora en la bitácora. No se cambió nada.');
    process.exit(1);
  }
  return a.id;
}

async function candidates(forUpdate = false) {
  return (
    await client.query(
      `SELECT p.id, p."batchId", b.code AS "batchCode", b.status AS "batchStatus", k.name AS "kitName"
         FROM "Pulse" p
         JOIN "Batch" b ON b.id = p."batchId"
         JOIN "Package" k ON k.id = p."packageId"
        WHERE p.status::text = 'UNCLAIMED' AND k.name <> $1 AND b.code !~* 'test'
        ORDER BY b.code, p.id ${forUpdate ? 'FOR UPDATE OF p' : ''}`,
      [KIT_NAME],
    )
  ).rows;
}

try {
  console.log(`\nBase: ${database} @ ${host}`);

  /* ------------------------------ DESHACER ------------------------------ */
  if (undoCode) {
    const b = (await client.query(`SELECT id, code, status FROM "Batch" WHERE code = $1`, [undoCode])).rows[0];
    if (!b) { console.error(`✖ No existe el lote ${undoCode}. No se cambió nada.`); process.exit(1); }
    const log = (await client.query(`SELECT metadata FROM "AuditLog" WHERE action = 'batch.reuse' AND "entityId" = $1 ORDER BY "createdAt" DESC LIMIT 1`, [b.id])).rows[0];
    const moved = log?.metadata?.moved; // { loteOrigenId: [pulseId, ...] }
    if (!moved || typeof moved !== 'object') {
      console.error('✖ Ese lote no se creó con este script (la bitácora no trae de dónde salió cada pulsera). No se cambió nada.');
      process.exit(1);
    }
    const origin = (await client.query(`SELECT id, "packageId" FROM "Batch" WHERE id = ANY($1)`, [Object.keys(moved)])).rows;
    const missing = Object.keys(moved).filter((id) => !origin.find((o) => o.id === id));
    if (missing.length) { console.error('✖ Alguno de los lotes de origen ya no existe. No se cambió nada.'); process.exit(1); }
    const stillFree = (await client.query(`SELECT id FROM "Pulse" WHERE "batchId" = $1 AND status::text = 'UNCLAIMED'`, [b.id])).rows.map((r) => r.id);
    const total = Object.values(moved).flat().length;
    const back = Object.entries(moved).map(([bid, ids]) => [bid, ids.filter((id) => stillFree.includes(id))]);
    const n = back.reduce((s, [, ids]) => s + ids.length, 0);
    console.log(`\nLote ${undoCode}: salieron ${total} pulseras; ${n} siguen sin registrar y volverían a sus lotes originales.`);
    console.log(`Las ${total - n} restantes ya se registraron y se quedan donde están.\n`);
    if (n === 0) { console.log('No hay nada que devolver.\n'); process.exit(0); }
    if ((await ask('Escribe SI para devolverlas: ')).trim() !== 'SI') { console.log('Cancelado. No se cambió nada.\n'); process.exit(0); }
    const actor = await actorId();
    await client.query('BEGIN');
    try {
      for (const [bid, ids] of back) {
        if (!ids.length) continue;
        const pk = origin.find((o) => o.id === bid).packageId;
        const r = await client.query(`UPDATE "Pulse" SET "batchId" = $1, "packageId" = $2, "updatedAt" = ${NOW} WHERE id = ANY($3) AND status::text = 'UNCLAIMED' AND "batchId" = $4`, [bid, pk, ids, b.id]);
        if (r.rowCount !== ids.length) throw new Error('Una pulsera cambió mientras tanto; se cancela todo.');
      }
      await client.query(
        `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt") VALUES ($1, $2, 'batch.reuse_undo', 'Batch', $3, $4::jsonb, ${NOW})`,
        [newId(), actor, b.id, JSON.stringify({ code: undoCode, returned: n })],
      );
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    console.log(`\n✔ Listo. ${n} pulseras regresaron a sus lotes. (El lote ${undoCode} se conserva; si queda vacío puedes borrarlo desde Admin → Lotes.)\n`);
    process.exit(0);
  }

  /* ------------------------------ VISTA PREVIA / APLICAR ------------------------------ */
  const kit = (await client.query(`SELECT id, price, "includedDrinks", active FROM "Package" WHERE name = $1`, [KIT_NAME])).rows[0];
  if (kit && (kit.price !== KIT_PRICE || kit.includedDrinks !== KIT_DRINKS)) {
    console.error(`✖ Ya existe el kit "${KIT_NAME}" pero con precio ${kit.price} y ${kit.includedDrinks} aguas (se esperaba ${KIT_PRICE} y ${KIT_DRINKS}). No se cambió nada.`);
    process.exit(1);
  }
  const rows = await candidates();
  const movable = rows.filter((r) => r.batchStatus !== 'CANCELADO');
  const skipped = rows.length - movable.length;
  const byBatch = new Map();
  for (const r of movable) byBatch.set(`${r.batchCode} (${r.kitName})`, (byBatch.get(`${r.batchCode} (${r.kitName})`) ?? 0) + 1);
  console.log(`\nKit destino: ${KIT_NAME} · $${(KIT_PRICE / 100).toFixed(2)} · ${KIT_DRINKS} aguas · sin beneficios ${kit ? '(ya existe)' : '(se creará)'}`);
  console.log(`\nPulseras SIN REGISTRAR que pasarían al kit del domingo: ${movable.length}`);
  for (const [k, n] of byBatch) console.log(`   ${String(n).padStart(4)}  de ${k}`);
  if (skipped) console.log(`   (se ignoran ${skipped} de lotes CANCELADO)`);
  console.log('\nNo se tocan las pulseras ya registradas, invalidadas, las del equipo ni las de lotes de prueba (código con "test").');
  if (movable.length === 0) { console.log('\nNo hay nada que mover.\n'); process.exit(0); }
  if (!apply) {
    console.log('\nVISTA PREVIA: no se escribió nada. Para aplicar:  npm run db:lote-domingo -- --aplicar\n');
    process.exit(0);
  }
  console.log('\n⚠ Toda pulsera sin registrar se toma como sobrante. Si alguna ya se vendió y su dueño aún no se registra, quedaría sin sus beneficios.\n');
  if ((await ask(`Escribe SI para mover ${movable.length} pulseras: `)).trim() !== 'SI') { console.log('Cancelado. No se cambió nada.\n'); process.exit(0); }

  const actor = await actorId();
  await client.query('BEGIN');
  try {
    const locked = (await candidates(true)).filter((r) => r.batchStatus !== 'CANCELADO');
    if (locked.length !== movable.length) throw new Error(`Cambió el número de pulseras mientras tanto (${movable.length} → ${locked.length}). Vuelve a correr el script.`);
    let kitId = kit?.id;
    if (!kitId) {
      kitId = newId();
      await client.query(`INSERT INTO "Package" (id, name, price, "includedDrinks", active, "updatedAt") VALUES ($1, $2, $3, $4, true, ${NOW})`, [kitId, KIT_NAME, KIT_PRICE, KIT_DRINKS]);
    }
    let code, n = 1;
    for (;;) {
      code = `${BATCH_PREFIX}${n}`;
      if (!(await client.query(`SELECT 1 FROM "Batch" WHERE code = $1`, [code])).rowCount) break;
      n++;
    }
    const batchId = newId();
    await client.query(`INSERT INTO "Batch" (id, code, "packageId", quantity, "createdById", status, "createdAt") VALUES ($1, $2, $3, $4, $5, 'ABIERTO', ${NOW})`, [batchId, code, kitId, locked.length, actor]);
    const moved = {};
    for (const r of locked) (moved[r.batchId] ??= []).push(r.id);
    const upd = await client.query(`UPDATE "Pulse" SET "batchId" = $1, "packageId" = $2, "updatedAt" = ${NOW} WHERE id = ANY($3) AND status::text = 'UNCLAIMED'`, [batchId, kitId, locked.map((r) => r.id)]);
    if (upd.rowCount !== locked.length) throw new Error('El UPDATE no afectó todas las pulseras esperadas.');
    await client.query(
      `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt") VALUES ($1, $2, 'batch.reuse', 'Batch', $3, $4::jsonb, ${NOW})`,
      [newId(), actor, batchId, JSON.stringify({ packageId: kitId, quantity: locked.length, code, reused: true, createdKit: !kit, moved })],
    );
    await client.query('COMMIT');
    console.log(`\n✔ Listo. ${locked.length} pulseras ahora están en el lote ${code} del kit "${KIT_NAME}".`);
    console.log(`  Para revertir (solo las que sigan sin registrar):  npm run db:lote-domingo -- --deshacer ${code}\n`);
  } catch (err) { await client.query('ROLLBACK'); throw err; }
} finally {
  await client.end();
}
