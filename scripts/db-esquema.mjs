// npm run db:esquema  -- SOLO LECTURA. No escribe nada en la base.
//
// Muestra la estructura REAL en Neon de las tablas que usa la Etapa 3
// (Batch, Pulse, Package, Attendee): columnas, tipos, defaults, CHECKs,
// índices y llaves foráneas. Verifica que la migración
// migrations/001_batch_status.sql esté aplicada y cuenta los datos.
//
// Sirve para comprobar que el código de server/ coincide con la base real
// (el schema.prisma del Next.js no es confiable: ver docs/CLAUDE_HANDOFF.md §12).
// La sesión se abre en modo READ ONLY: aunque hubiera un error en este script,
// Postgres rechazaría cualquier escritura.
import { connect } from './_db.mjs';

const TABLES = ['Batch', 'Pulse', 'Package', 'Attendee'];

const { client, host, database } = connect();
await client.connect();
try {
  await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  console.log(`\nBase: ${database} @ ${host}  (solo lectura)\n`);

  for (const table of TABLES) {
    const { rows: cols } = await client.query(
      `SELECT column_name, data_type, udt_name, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position`,
      [table],
    );
    console.log(`── "${table}" ${'─'.repeat(Math.max(2, 60 - table.length))}`);
    if (!cols.length) {
      console.log('   (NO EXISTE)\n');
      continue;
    }
    for (const c of cols) {
      const type = c.data_type === 'USER-DEFINED' ? c.udt_name : c.data_type;
      const nul = c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const def = c.column_default ? `  default ${c.column_default}` : '';
      console.log(`   ${c.column_name.padEnd(16)} ${type.padEnd(28)} ${nul}${def}`);
    }
    const { rows: cons } = await client.query(
      `SELECT conname, contype, pg_get_constraintdef(oid) AS def
         FROM pg_constraint WHERE conrelid = format('%I', $1::text)::regclass
        ORDER BY contype, conname`,
      [table],
    );
    for (const k of cons.filter((c) => c.contype !== 'n')) {
      const kind = { p: 'PK', u: 'UNIQUE', f: 'FK', c: 'CHECK' }[k.contype] ?? k.contype;
      console.log(`   ${kind.padEnd(7)} ${k.conname}: ${k.def}`);
    }
    const { rows: idx } = await client.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1 ORDER BY indexname`,
      [table],
    );
    for (const i of idx) {
      const kind = /^CREATE UNIQUE INDEX/i.test(i.indexdef) ? 'UNIQUE ' : 'INDEX  ';
      console.log(`   ${kind} ${i.indexname}: ${i.indexdef.replace(/^.* USING /, 'USING ')}`);
    }
    console.log('');
  }

  // Migración 001 (Batch.status)
  const status = (
    await client.query(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Batch' AND column_name = 'status'`,
    )
  ).rows[0];
  const check = (
    await client.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = '"Batch"'::regclass AND conname = 'batch_status_valid'`,
    )
  ).rows[0];
  const index = (
    await client.query(`SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'Batch_status_idx'`)
  ).rowCount;
  const okStatus =
    status && status.data_type === 'text' && status.is_nullable === 'NO' && /'ABIERTO'/.test(status.column_default ?? '');
  const okCheck = check && ['ABIERTO', 'CERRADO', 'CANCELADO'].every((v) => check.def.includes(`'${v}'`));
  console.log('── Migración 001_batch_status.sql ' + '─'.repeat(30));
  console.log(`   columna "Batch"."status" TEXT NOT NULL DEFAULT 'ABIERTO' : ${okStatus ? 'OK' : 'NO / DISTINTA'}`);
  console.log(`   CHECK batch_status_valid (ABIERTO, CERRADO, CANCELADO)   : ${okCheck ? 'OK' : 'NO / DISTINTO'}`);
  console.log(`   índice Batch_status_idx                                  : ${index ? 'OK' : 'NO EXISTE'}`);
  console.log(
    `   => ${okStatus && okCheck && index ? 'APLICADA. No volver a correr npm run db:migrar.' : 'NO aplicada o incompleta: avisar antes de hacer nada.'}\n`,
  );

  // Conteos
  const n = async (sql) => (await client.query(sql)).rows[0].n;
  console.log('── Datos ' + '─'.repeat(55));
  const counts = {
    'Iglesias (Church)': await n(`SELECT count(*)::int AS n FROM "Church"`),
    'Paquetes (Package)': await n(`SELECT count(*)::int AS n FROM "Package"`),
    'Usuarios (User)': await n(`SELECT count(*)::int AS n FROM "User"`),
    'Lotes (Batch)': await n(`SELECT count(*)::int AS n FROM "Batch"`),
    'Pulseras (Pulse)': await n(`SELECT count(*)::int AS n FROM "Pulse"`),
    '  · solo QR (Etapa 3)': await n(`SELECT count(*)::int AS n FROM "Pulse" WHERE "manualCode" LIKE 'QRONLY:%'`),
    '  · con código AR26': await n(`SELECT count(*)::int AS n FROM "Pulse" WHERE "manualCode" LIKE 'AR26-%'`),
    'Asistentes (Attendee)': await n(`SELECT count(*)::int AS n FROM "Attendee"`),
    'Canjes (Redemption)': await n(`SELECT count(*)::int AS n FROM "Redemption"`),
    'AuditLog batch.create': await n(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'batch.create'`),
  };
  for (const [k, v] of Object.entries(counts)) console.log(`   ${k.padEnd(26)} ${String(v).padStart(6)}`);
  const { rows: pk } = await client.query(
    `SELECT name, price, "includedDrinks", active FROM "Package" ORDER BY price, name`,
  );
  console.log('\n   Paquetes:');
  for (const p of pk) {
    console.log(`     ${p.name.padEnd(12)} $${(p.price / 100).toFixed(2).padStart(7)}  ${p.includedDrinks} aguas  ${p.active ? 'activo' : 'INACTIVO'}`);
  }
  console.log('');
} finally {
  await client.end();
}
