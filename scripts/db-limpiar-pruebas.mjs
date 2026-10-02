// npm run db:limpiar-pruebas -- respaldos/respaldo-XXXX.json
// Borra TODAS las pulseras, lotes, asistentes, canjes e instantáneas (datos de
// prueba) y su historial de pruebas. Deja intactos iglesias, paquetes,
// usuarios y configuración. Todo en UNA transacción: o se borra todo o nada.
//
// Por seguridad exige:
//  1. un archivo de respaldo (de npm run db:respaldo) creado hace menos de 2 horas
//     y que coincida con lo que hay hoy en la base;
//  2. escribir BORRAR para confirmar.
import fs from 'node:fs';
import { TABLES, ask, connect, counts, printCounts } from './_db.mjs';

const backupPath = process.argv[2];
if (!backupPath || !fs.existsSync(backupPath)) {
  console.error('\n✖ Indica el respaldo:  npm run db:limpiar-pruebas -- respaldos/respaldo-XXXX.json');
  console.error('  (créalo primero con: npm run db:respaldo)\n');
  process.exit(1);
}
const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
const ageMin = (Date.now() - new Date(backup.creado).getTime()) / 60000;
if (!(ageMin >= 0 && ageMin < 120)) {
  console.error(`\n✖ Ese respaldo tiene ${Math.round(ageMin)} minutos. Haz uno nuevo (npm run db:respaldo) justo antes de limpiar.\n`);
  process.exit(1);
}

const { client, host, database } = connect();
await client.connect();
try {
  const now = await counts(client);
  const differs = TABLES.filter((t) => now[t.name] !== backup.conteo[t.name]).map((t) => t.name);
  if (differs.length) {
    console.error(`\n✖ La base cambió desde el respaldo (${differs.join(', ')}). Haz un respaldo nuevo.\n`);
    process.exit(1);
  }

  console.log(`Base: ${database} @ ${host}`);
  printCounts('Se va a BORRAR:', now);
  console.log('\nNo se tocan: iglesias, presbiterios, zonas, paquetes, usuarios ni configuración.');
  const answer = await ask('\nEscribe BORRAR para continuar (cualquier otra cosa cancela): ');
  if (answer !== 'BORRAR') {
    console.log('Cancelado. No se borró nada.\n');
    process.exit(0);
  }

  await client.query('BEGIN');
  try {
    for (const t of [...TABLES].reverse()) {
      await client.query(`DELETE FROM "${t.name}"${t.where ? ` WHERE ${t.where}` : ''}`, t.params ?? []);
    }
    const after = await counts(client);
    const left = Object.entries(after).filter(([, n]) => n !== 0);
    if (left.length) throw new Error(`Quedaron filas: ${left.map(([k, n]) => `${k}=${n}`).join(', ')}`);
    await client.query('COMMIT');
    printCounts('Después de limpiar:', after);
    console.log('\n✔ Listo. Los lotes nuevos empiezan otra vez en LOTE-' + new Date().getFullYear() + '-001.');
    console.log(`  Si necesitas regresar: npm run db:restaurar -- ${backupPath}\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n✖ No se borró nada (se deshizo todo):', err.message, '\n');
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
