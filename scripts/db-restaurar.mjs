// npm run db:restaurar -- respaldos/respaldo-XXXX.json
// Vuelve a insertar EXACTAMENTE las filas guardadas en el respaldo. Todo en
// una transacción: si algo choca (por ejemplo, ya existe una pulsera con el
// mismo código), no se inserta nada.
import fs from 'node:fs';
import { TABLES, ask, connect, counts, printCounts } from './_db.mjs';

const backupPath = process.argv[2];
if (!backupPath || !fs.existsSync(backupPath)) {
  console.error('\n✖ Indica el respaldo:  npm run db:restaurar -- respaldos/respaldo-XXXX.json\n');
  process.exit(1);
}
const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

const { client, host, database } = connect();
await client.connect();
try {
  console.log(`Base: ${database} @ ${host}`);
  console.log(`Respaldo del ${backup.creado} (${backup.base})`);
  printCounts('Se va a RESTAURAR:', backup.conteo);
  printCounts('Hoy hay en la base:', await counts(client));
  const answer = await ask('\nEscribe RESTAURAR para continuar: ');
  if (answer !== 'RESTAURAR') {
    console.log('Cancelado. No se cambió nada.\n');
    process.exit(0);
  }

  await client.query('BEGIN');
  try {
    for (const t of TABLES) {
      const rows = backup.data[t.name] ?? [];
      if (!rows.length) continue;
      // json_populate_recordset convierte cada valor al tipo exacto de la columna.
      await client.query(`INSERT INTO "${t.name}" SELECT * FROM json_populate_recordset(NULL::"${t.name}", $1::json)`, [
        JSON.stringify(rows),
      ]);
    }
    await client.query('COMMIT');
    printCounts('Después de restaurar:', await counts(client));
    console.log('\n✔ Respaldo restaurado.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n✖ No se restauró nada (se deshizo todo):', err.message);
    console.error('  Si la base ya tiene datos nuevos que chocan con el respaldo, avísame antes de intentar otra cosa.\n');
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
