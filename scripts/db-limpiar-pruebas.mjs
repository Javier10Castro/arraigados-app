// npm run db:limpiar-pruebas              limpia de verdad (pide confirmación)
// npm run db:limpiar-pruebas -- --simular solo MUESTRA qué borraría (no cambia ni respalda nada)
//
// Deja la base lista para el evento: borra TODO lo generado durante las pruebas y conserva lo que
// se configura una vez. Todo en UNA transacción: o se borra todo o nada.
//
//  SE BORRA:  lotes, pulseras, asistentes (registros), canjes, notas y sus likes, avisos y el estado
//             de la campana, instantáneas de prueba y la bitácora (AuditLog) de esas pruebas.
//  SE CONSERVA: cuentas (Admin y Staff), paquetes, zonas, presbiterios, iglesias, sedes, menú
//             (platillos), mercancía, beneficios, palabras bloqueadas, ajustes, las fotos y la
//             bitácora de cuentas/iglesias/ajustes. Cualquier tabla que este script no conozca
//             NO se toca.
//
// Seguridad:
//  1. antes de borrar guarda AUTOMÁTICAMENTE un respaldo total (si falla, no borra nada);
//  2. pide escribir LIMPIAR TODO;
//  3. si algo falla a la mitad, se deshace todo.
import path from 'node:path';
import { ask, connect } from './_db.mjs';
import { crearRespaldoTotal, listTables, printTable } from './_respaldo.mjs';

const simulate = process.argv.includes('--simular');

/** Hijos primero. Solo estas tablas se vacían; todo lo demás se conserva. */
const CLEAN = ['NoteLike', 'Note', 'NotificationState', 'Redemption', 'Pulse', 'Attendee', 'Batch', 'Announcement', 'InstantView', 'InstantCredit', 'Instant'];
/** AuditLog: solo las entradas de estas entidades (pruebas). Cuentas, iglesias, ajustes, menú... se conservan. */
const TEST_AUDIT_TYPES = ['Batch', 'Pulse', 'Attendee', 'Redemption', 'Note', 'NoteLike', 'Announcement', 'InstantCredit', 'Instant', 'InstantView'];
const KEEP = ['User', 'Package', 'PackageBenefit', 'Zone', 'Presbytery', 'Church', 'Venue', 'Dish', 'MerchItem', 'MerchImage', 'BlockedWord', 'InstantConfig'];

const { client, host, database } = connect();
await client.connect();
try {
  const existing = new Set(await listTables(client));
  const clean = CLEAN.filter((t) => existing.has(t));
  const count = async (t) => (await client.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n;
  const auditWhere = `"entityType" = ANY($1)`;

  const toDelete = {};
  for (const t of clean) toDelete[t] = await count(t);
  const audit = (await client.query(`SELECT count(*)::int AS n FROM "AuditLog" WHERE ${auditWhere}`, [TEST_AUDIT_TYPES])).rows[0].n;
  toDelete['AuditLog (pruebas)'] = audit;

  const kept = {};
  for (const t of KEEP.filter((t) => existing.has(t))) kept[t] = await count(t);
  kept['AuditLog (resto)'] = (await client.query(`SELECT count(*)::int AS n FROM "AuditLog" WHERE NOT (${auditWhere})`, [TEST_AUDIT_TYPES])).rows[0].n;
  const unknown = [...existing].filter((t) => !CLEAN.includes(t) && !KEEP.includes(t) && t !== 'AuditLog');

  console.log(`Base: ${database} @ ${host}${simulate ? '   (SIMULACIÓN: no se cambia nada)' : ''}`);
  printTable('Se va a BORRAR:', toDelete);
  printTable('Se CONSERVA:', kept);
  if (unknown.length) console.log(`\nTablas que este script no conoce (no se tocan): ${unknown.join(', ')}`);

  // Datos reales vs. de prueba: ayuda a notar si ya hay registros verdaderos.
  if (existing.has('Attendee') && toDelete.Attendee > 0) {
    const r = (await client.query(`SELECT min("createdAt") AS a, max("createdAt") AS b FROM "Attendee"`)).rows[0];
    const active = existing.has('Pulse') ? (await client.query(`SELECT count(*)::int AS n FROM "Pulse" WHERE status = 'ACTIVE'`)).rows[0].n : 0;
    console.log(`\nAsistentes registrados entre ${new Date(r.a).toISOString().slice(0, 16)} y ${new Date(r.b).toISOString().slice(0, 16)} (UTC); pulseras activas: ${active}.`);
  }

  const admins = (await client.query(`SELECT name, email FROM "User" WHERE role = 'ADMIN' AND active = true ORDER BY name`)).rows;
  const staff = (await client.query(`SELECT count(*)::int AS n FROM "User" WHERE role = 'STAFF' AND active = true`)).rows[0].n;
  console.log(`\nCuentas que se conservan: ${admins.length} Admin activas (${admins.map((a) => a.email).join(', ') || 'ninguna'}) y ${staff} Staff activas.`);
  if (!admins.length) {
    console.error('\n✖ No hay ninguna cuenta Admin activa: no se limpia nada. Revisa la tabla "User".\n');
    process.exit(1);
  }
  const suspicious = (await client.query(`SELECT email FROM "User" WHERE email ~* '(demo|prueba|test|ejemplo|example)'`)).rows;
  if (suspicious.length) console.log(`  Revisa estas cuentas, parecen de prueba (NO se borran): ${suspicious.map((u) => u.email).join(', ')}`);

  if (simulate) {
    console.log('\nSimulación terminada. Para limpiar de verdad:  npm run db:limpiar-pruebas\n');
    process.exit(0);
  }

  console.log('\n⚠ Esto borra TODAS las pulseras, lotes y registros de asistentes, incluso si alguno fuera real.');
  console.log('  Antes se guarda un respaldo total y se puede regresar con db:restaurar-total --reemplazar.');
  const answer = await ask('\nEscribe LIMPIAR TODO para continuar (cualquier otra cosa cancela): ');
  if (answer !== 'LIMPIAR TODO') {
    console.log('Cancelado. No se borró nada.\n');
    process.exit(0);
  }

  const backup = await crearRespaldoTotal(client, { base: `${database} @ ${host}`, prefijo: 'antes-de-limpiar' });
  const rel = path.relative(process.cwd(), backup.dir);
  console.log(`\n✔ Respaldo guardado y verificado: ${rel}`);
  if (!backup.fotos) console.log('  (Las fotos no se incluyeron: no se van a borrar, así que no hay riesgo con ellas.)');

  await client.query('BEGIN');
  try {
    for (const t of clean) await client.query(`DELETE FROM "${t}"`);
    await client.query(`DELETE FROM "AuditLog" WHERE ${auditWhere}`, [TEST_AUDIT_TYPES]);

    const left = {};
    for (const t of clean) {
      const n = await count(t);
      if (n) left[t] = n;
    }
    const leftAudit = (await client.query(`SELECT count(*)::int AS n FROM "AuditLog" WHERE ${auditWhere}`, [TEST_AUDIT_TYPES])).rows[0].n;
    if (leftAudit) left.AuditLog = leftAudit;
    if (Object.keys(left).length) throw new Error(`Quedaron filas: ${Object.entries(left).map(([k, n]) => `${k}=${n}`).join(', ')}`);
    for (const t of KEEP.filter((t) => existing.has(t))) {
      if ((await count(t)) !== kept[t]) throw new Error(`Cambió una tabla que debía conservarse: ${t}`);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n✖ No se borró nada (se deshizo todo):', err.message, '\n');
    process.exit(1);
  }

  const after = {};
  for (const t of clean) after[t] = await count(t);
  printTable('Después de limpiar (debe ser 0):', after);
  printTable('Conservado:', kept);
  console.log(`\n✔ Listo: la base quedó limpia y lista para usarse. Los lotes nuevos empiezan en LOTE-${new Date().getFullYear()}-001.`);
  console.log(`  Si necesitas regresar:  npm run db:restaurar-total -- ${rel} --reemplazar\n`);
} finally {
  await client.end();
}
