// npm run db:migrar                       -> aplica TODAS las migraciones de migrations/*.sql
// npm run db:migrar -- --only 012_x.sql   -> aplica SOLO ese archivo (no toca las demás)
//
// Aplica en orden los archivos de `migrations/*.sql` contra Neon.
//
// MODO --only <archivo>: ejecuta únicamente la migración indicada (nombre exacto de un
// archivo que exista en migrations/; sin rutas). Es el modo seguro cuando hay migraciones
// que NO deben aplicarse todavía (p. ej. 011_rate_limit.sql). Con --only no se corre la
// verificación de "Batch"."status", que solo aplica a la migración 001.
//
// La Etapa 3 tiene UNA migración (001_batch_status.sql, agrega
// "Batch"."status"). Cada archivo está escrito con IF NOT EXISTS / DROP
// CONSTRAINT IF EXISTS, así que correrlo dos veces no rompe nada y no hace
// falta llevar una tabla de "migraciones aplicadas".
//
// A diferencia de db-conteo / db-limpiar-pruebas, este script SÍ escribe:
// solo ejecuta DDL. Pide confirmación salvo que se pase `--yes`.
import { connect, ask } from './_db.mjs';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'migrations');

const all = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

// --only <archivo>: una sola migración, validada contra la lista real de migrations/.
const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
let only = null;
if (onlyIdx !== -1) {
  only = args[onlyIdx + 1];
  if (!only || only.startsWith('--')) {
    console.error('\n✖ --only necesita el nombre exacto del archivo, p. ej.: --only 012_staff_pulse.sql\n');
    process.exit(1);
  }
  if (!all.includes(only)) {
    console.error(`\n✖ "${only}" no es un archivo de migrations/ (solo nombres exactos, sin rutas). Disponibles:`);
    for (const f of all) console.error(`  - ${f}`);
    console.error('');
    process.exit(1);
  }
}
const files = only ? [only] : all;

if (!files.length) {
  console.log('\nNo hay migraciones en migrations/.\n');
  process.exit(0);
}

const { client, host, database } = connect();

console.log(`\nBase: ${database} @ ${host}`);
console.log(only ? `MODO --only: se aplica SOLO 1 migración (las demás NO se tocan):` : `Migraciones a aplicar (${files.length}):`);
for (const f of files) console.log(`  - ${f}`);
console.log('');

if (!process.argv.includes('--yes')) {
  const answer = await ask('Aplicar? escribe SI para confirmar: ');
  if (answer.toUpperCase() !== 'SI') {
    console.log('\nCancelado. No se aplicó nada.\n');
    process.exit(0);
  }
}

await client.connect();
try {
  for (const f of files) {
    const sql = readFileSync(path.join(dir, f), 'utf8');
    process.stdout.write(`Aplicando ${f} ... `);
    try {
      await client.query(sql);
      console.log('OK');
    } catch (err) {
      console.log('FALLO');
      console.error(`\n${f}: ${err.message}\n`);
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await client.end();
}

// Verificación de solo lectura: el resultado real en la base (solo aplica a la migración 001, modo completo).
if (!only) await (async () => {
  const { client: c2 } = connect();
  await c2.connect();
  try {
    const { rows } = await c2.query(`
      SELECT c.column_name, c.data_type, c.is_nullable, c.column_default
        FROM information_schema.columns c
       WHERE c.table_schema = 'public' AND c.table_name = 'Batch' AND c.column_name = 'status'`);
    console.log('\n"Batch"."status":', rows.length ? JSON.stringify(rows[0]) : 'NO EXISTE');
    const { rows: cons } = await c2.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = '"Batch"'::regclass AND contype = 'c'`);
    for (const r of cons) console.log(`CHECK ${r.conname}: ${r.def}`);
    const { rows: idx } = await c2.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'Batch' AND indexname = 'Batch_status_idx'`);
    console.log('Índice Batch_status_idx:', idx.length ? 'OK' : 'NO EXISTE');
  } finally {
    await c2.end();
  }
})();
