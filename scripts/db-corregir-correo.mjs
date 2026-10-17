// npm run db:corregir-correo -- --de correo-actual@dominio --a correo-nuevo@dominio
//
// Corrige el correo de UNA cuenta del equipo (p. ej. un dominio mal escrito). ESCRIBE en la base a la que apunta
// DATABASE_URL, pero solo una fila, con todas estas protecciones:
//   · el correo actual debe existir EXACTAMENTE una vez y el nuevo no debe estar en uso;
//   · muestra la base (servidor y nombre, nunca la contraseña), la cuenta (nombre, rol, activa) y pide escribir SI;
//   · no toca la contraseña, el rol, la pulsera ni nada más; deja una entrada en la bitácora ("user.update", antes/después);
//   · todo en una transacción: si algo falla, no cambia nada.
// Para deshacerlo, vuelve a correr el script con --de y --a invertidos.
import { connect, ask } from './_db.mjs';
import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const val = (flag) => {
  const k = args.indexOf(flag);
  return k >= 0 ? String(args[k + 1] ?? '').trim().toLowerCase() : '';
};
const de = val('--de');
const a = val('--a');
const known = new Set(['--de', '--a']);
if (!de || !a || args.some((x, k) => !(known.has(x) || (k > 0 && known.has(args[k - 1]))))) {
  console.error('Uso: npm run db:corregir-correo -- --de correo-actual@dominio --a correo-nuevo@dominio');
  process.exit(1);
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!EMAIL_RE.test(de) || !EMAIL_RE.test(a) || a.length > 120) {
  console.error('Alguno de los correos no es válido.');
  process.exit(1);
}
if (de === a) {
  console.error('El correo nuevo es igual al actual: no hay nada que cambiar.');
  process.exit(1);
}

const newId = () => 'c' + Array.from(randomBytes(24), (b) => '0123456789abcdefghijklmnopqrstuvwxyz'[b % 36]).join('');
const { client, host, database } = connect();
await client.connect();
try {
  console.log(`\nBase: ${database} @ ${host}`);
  const found = (await client.query(`SELECT id, name, role::text AS role, active FROM "User" WHERE lower(email) = $1`, [de])).rows;
  if (found.length !== 1) {
    console.error(`✖ Se esperaba exactamente 1 cuenta con ese correo y hay ${found.length}. No se cambió nada.`);
    process.exit(1);
  }
  const u = found[0];
  if ((await client.query(`SELECT 1 FROM "User" WHERE lower(email) = $1`, [a])).rowCount) {
    console.error('✖ Ya existe una cuenta con el correo nuevo. No se cambió nada.');
    process.exit(1);
  }
  const owner = (process.env.OWNER_EMAIL || 'javiercastro9912@gmail.com').trim().toLowerCase();
  const actor = (await client.query(`SELECT id FROM "User" WHERE lower(email) = $1 AND role::text = 'ADMIN'`, [owner])).rows[0];
  if (!actor) {
    console.error('✖ No encontré la cuenta propietaria (Admin) para dejarla como autora en la bitácora. No se cambió nada.');
    process.exit(1);
  }
  console.log(`\nCuenta: ${u.name} · ${u.role} · ${u.active ? 'activa' : 'DESACTIVADA'}`);
  console.log(`   correo actual : ${de}`);
  console.log(`   correo nuevo  : ${a}`);
  console.log('   (la contraseña y todo lo demás quedan igual)\n');
  const answer = (await ask('Escribe SI para aplicar el cambio: ')).trim();
  if (answer !== 'SI') {
    console.log('Cancelado. No se cambió nada.\n');
    process.exit(0);
  }
  await client.query('BEGIN');
  try {
    const res = await client.query(`UPDATE "User" SET email = $2, "updatedAt" = (now() AT TIME ZONE 'UTC') WHERE id = $1 AND lower(email) = $3`, [u.id, a, de]);
    if (res.rowCount !== 1) throw new Error('El UPDATE no afectó exactamente 1 fila.');
    await client.query(
      `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
       VALUES ($1, $2, 'user.update', 'User', $3, $4::jsonb, (now() AT TIME ZONE 'UTC'))`,
      [newId(), actor.id, u.id, JSON.stringify({ email: a, name: u.name, before: { email: de }, after: { email: a } })],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
  console.log(`\n✔ Listo. ${u.name} ahora entra con ${a} (misma contraseña que tenía).\n`);
} finally {
  await client.end();
}
