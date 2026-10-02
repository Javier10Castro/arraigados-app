// npm run db:respaldo
// Guarda en respaldos/ un archivo JSON con TODAS las filas de datos de prueba
// (pulseras, lotes, asistentes, canjes, instantáneas y su historial).
// Solo lee la base: no cambia nada en Neon.
import fs from 'node:fs';
import path from 'node:path';
import { TABLES, connect, counts, printCounts } from './_db.mjs';

const { client, host, database } = connect();
await client.connect();
try {
  const data = {};
  // row_to_json conserva los valores EXACTOS (fechas sin zona, enums, JSON)
  // para poder restaurarlos tal cual con json_populate_recordset.
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); // foto consistente
  for (const t of TABLES) {
    const { rows } = await client.query(
      `SELECT coalesce(json_agg(row_to_json(x)), '[]'::json) AS rows
         FROM (SELECT * FROM "${t.name}"${t.where ? ` WHERE ${t.where}` : ''}) x`,
      t.params ?? [],
    );
    data[t.name] = rows[0].rows;
  }
  const before = await counts(client);
  await client.query('COMMIT');

  for (const t of TABLES) {
    if (data[t.name].length !== before[t.name]) throw new Error(`Conteo distinto en ${t.name}; vuelve a intentar.`);
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const dir = path.resolve('respaldos');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `respaldo-${stamp}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ version: 1, creado: new Date().toISOString(), base: `${database} @ ${host}`, conteo: before, data }),
  );

  // Verificación: releer el archivo y comparar conteos.
  const check = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const t of TABLES) {
    if (check.data[t.name].length !== before[t.name]) throw new Error(`El archivo no quedó completo (${t.name}).`);
  }

  printCounts('Respaldado:', before);
  const kb = (fs.statSync(file).size / 1024).toFixed(1);
  console.log(`\n✔ Respaldo guardado y verificado: ${path.relative(process.cwd(), file)} (${kb} KB)`);
  console.log('  Para restaurarlo:        npm run db:restaurar -- ' + path.relative(process.cwd(), file));
  console.log('  Para borrarlo (si todo salió bien): npm run db:borrar-respaldo -- ' + path.relative(process.cwd(), file) + '\n');
} finally {
  await client.end();
}
