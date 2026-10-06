// npm run db:restaurar-total -- respaldos/total-XXXX            (base vacía)
// npm run db:restaurar-total -- respaldos/total-XXXX --reemplazar (la base ya tiene datos)
//
// Vuelve a insertar EXACTAMENTE lo guardado por db:respaldo-total. Todo en UNA transacción: o se
// restaura todo o nada. Por seguridad:
//  - verifica el archivo (huella y conteos) antes de tocar la base;
//  - exige que existan todas las tablas del respaldo (si falta alguna: npm run db:migrar primero);
//  - sin --reemplazar solo funciona si esas tablas están VACÍAS;
//  - con --reemplazar guarda primero una copia de seguridad de lo que hay hoy y pide escribir
//    REEMPLAZAR TODO.
// Las fotos se vuelven a subir a Netlify Blobs si el respaldo las trae y .env tiene credenciales.
import fs from 'node:fs';
import path from 'node:path';
import { ask, connect } from './_db.mjs';
import {
  countRows,
  crearRespaldoTotal,
  listTables,
  openNetlifyStore,
  printTable,
  restaurarFotos,
  verificarRespaldo,
} from './_respaldo.mjs';

const args = process.argv.slice(2);
const replace = args.includes('--reemplazar');
const target = args.find((a) => !a.startsWith('--'));
if (!target || !fs.existsSync(path.join(target, 'datos.json'))) {
  console.error('\n✖ Indica la carpeta del respaldo:  npm run db:restaurar-total -- respaldos/total-AAAAMMDD-HHMM\n');
  process.exit(1);
}
const dir = path.resolve(target);
let backup;
try {
  backup = verificarRespaldo(dir);
} catch (err) {
  console.error(`\n✖ ${err.message}\n`);
  process.exit(1);
}

const { client, host, database } = connect();
await client.connect();
try {
  console.log(`Base: ${database} @ ${host}`);
  console.log(`Respaldo del ${backup.creado} (${backup.base})`);
  const existing = new Set(await listTables(client));
  const missing = backup.orden.filter((t) => !existing.has(t));
  if (missing.length) {
    console.error(`\n✖ Faltan tablas en esta base: ${missing.join(', ')}. Corre primero: npm run db:migrar\n`);
    process.exit(1);
  }
  const now = await countRows(client, backup.orden);
  const filled = Object.entries(now).filter(([, n]) => n > 0);
  printTable('Se va a RESTAURAR:', backup.conteo);
  if (filled.length && !replace) {
    printTable('✖ La base NO está vacía:', Object.fromEntries(filled));
    console.error('\n  Para sustituir lo que hay por el respaldo agrega --reemplazar (primero guarda una copia de seguridad).\n');
    process.exit(1);
  }
  if (filled.length) {
    console.log('\nCon --reemplazar se BORRA lo que hay hoy en esas tablas y se pone el respaldo.');
    const word = await ask('Escribe REEMPLAZAR TODO para continuar (cualquier otra cosa cancela): ');
    if (word !== 'REEMPLAZAR TODO') {
      console.log('Cancelado. No se cambió nada.\n');
      process.exit(0);
    }
    const safe = await crearRespaldoTotal(client, { base: `${database} @ ${host}`, prefijo: 'antes-de-restaurar' });
    console.log(`✔ Copia de seguridad de lo actual: ${path.relative(process.cwd(), safe.dir)}`);
  } else {
    const word = await ask('\nEscribe RESTAURAR para continuar: ');
    if (word !== 'RESTAURAR') {
      console.log('Cancelado. No se cambió nada.\n');
      process.exit(0);
    }
  }

  await client.query('BEGIN');
  try {
    if (filled.length) await client.query(`TRUNCATE ${backup.orden.map((t) => `"${t}"`).join(', ')} CASCADE`);
    for (const t of backup.orden) {
      const rows = backup.data[t] ?? [];
      if (!rows.length) continue;
      // json_populate_recordset convierte cada valor al tipo exacto de la columna.
      await client.query(`INSERT INTO "${t}" SELECT * FROM json_populate_recordset(NULL::"${t}", $1::json)`, [JSON.stringify(rows)]);
    }
    const after = await countRows(client, backup.orden);
    const bad = backup.orden.filter((t) => after[t] !== backup.conteo[t]);
    if (bad.length) throw new Error(`Los conteos no coinciden: ${bad.join(', ')}`);
    await client.query('COMMIT');
    printTable('Después de restaurar:', after);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n✖ No se restauró nada (se deshizo todo):', err.message, '\n');
    process.exit(1);
  }

  if (backup.fotos) {
    const n = await restaurarFotos(dir, backup.fotos, openNetlifyStore);
    if (n === null) console.log('\n⚠ Datos restaurados, pero las fotos NO: faltan NETLIFY_SITE_ID y NETLIFY_AUTH_TOKEN en .env.');
    else console.log(`\n✔ Fotos restauradas: ${n}`);
  }
  console.log('\n✔ Respaldo restaurado.\n');
} finally {
  await client.end();
}
