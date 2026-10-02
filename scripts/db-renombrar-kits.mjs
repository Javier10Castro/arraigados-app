// npm run db:renombrar-kits
//
// Renombra los paquetes de Neon a los nombres definitivos de los kits:
//   A        -> "Kit - A"
//   B        -> "Kit - B"
//   C        -> "Especial"
// (también reconoce "Paquete A", "Kit A", "kit-b", "Especial", etc.)
//
// Por qué: la app (Crear lote, Mi kit, Staff) muestra el nombre tal cual está
// en Neon, y los beneficios fijos de src/data/app.ts (packageContent) están
// ligados a "Kit - A", "Kit - B" y "Especial".
//
// SÍ escribe en la base, pero SOLO la columna "name" (y "updatedAt") de
// "Package". No toca precio, aguas, ni ningún lote, pulsera o asistente: todos
// apuntan al paquete por id, así que siguen ligados igual. Deja una entrada en
// AuditLog (action "package.rename") por cada cambio.
//
// Muestra el plan y pide escribir SI antes de cambiar nada. Se puede correr
// varias veces: si ya están bien, no hace nada.
import { randomBytes } from 'node:crypto';
import { ask, connect } from './_db.mjs';

const TARGET = { A: 'Kit - A', B: 'Kit - B', C: 'Especial', ESPECIAL: 'Especial' };

/** "Paquete A" / "Kit - a" / "A" -> "A"; "Especial" -> "ESPECIAL". */
function key(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\b(PAQUETE|KIT)\b/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

/** Mismo formato que newId() de server/db.ts (id estilo cuid de Prisma). */
function newId() {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = randomBytes(24);
  let out = 'c';
  for (let i = 0; i < 24; i++) out += alphabet[bytes[i] % 36];
  return out;
}

const { client, host, database } = connect();
await client.connect();
try {
  console.log(`\nBase: ${database} @ ${host}\n`);
  const { rows } = await client.query(
    `SELECT id, name, price, "includedDrinks", active FROM "Package" ORDER BY price, name`,
  );

  console.log('Paquetes actuales:');
  for (const p of rows) {
    console.log(`  "${p.name}"  ·  $${(p.price / 100).toFixed(2)}  ·  ${p.includedDrinks} aguas  ·  ${p.active ? 'activo' : 'inactivo'}`);
  }

  const plan = [];
  const unknown = [];
  for (const p of rows) {
    const to = TARGET[key(p.name)];
    if (!to) unknown.push(p.name);
    else if (p.name !== to) plan.push({ id: p.id, from: p.name, to });
  }

  if (unknown.length) {
    console.log(`\nNo sé a qué kit corresponden (no se tocan): ${unknown.map((n) => `"${n}"`).join(', ')}`);
  }
  if (!plan.length) {
    console.log('\nNada que cambiar: los nombres ya son los definitivos.\n');
    process.exit(0);
  }

  // Dos paquetes no pueden quedar con el mismo nombre ("Package".name es único).
  const finalNames = rows.map((p) => plan.find((x) => x.id === p.id)?.to ?? p.name);
  const dup = finalNames.find((n, i) => finalNames.indexOf(n) !== i);
  if (dup) {
    console.log(`\n✖ Cancelado: quedarían dos paquetes llamados "${dup}". Revisa los nombres a mano.\n`);
    process.exit(1);
  }

  console.log('\nCambios:');
  for (const x of plan) console.log(`  "${x.from}"  ->  "${x.to}"`);
  console.log('\nSolo cambia el nombre. Precio, aguas, lotes, pulseras y asistentes quedan igual.');

  if (!process.argv.includes('--yes')) {
    const answer = await ask('\n¿Aplicar? escribe SI para confirmar: ');
    if (answer.toUpperCase() !== 'SI') {
      console.log('\nCancelado. No se cambió nada.\n');
      process.exit(0);
    }
  }

  await client.query('BEGIN');
  try {
    for (const x of plan) {
      const res = await client.query(
        `UPDATE "Package" SET name = $1, "updatedAt" = (now() AT TIME ZONE 'utc') WHERE id = $2 AND name = $3`,
        [x.to, x.id, x.from],
      );
      if (res.rowCount !== 1) throw new Error(`"${x.from}" cambió mientras tanto; no se aplicó nada.`);
      await client.query(
        `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
         VALUES ($1, NULL, 'package.rename', 'Package', $2, $3::jsonb, (now() AT TIME ZONE 'utc'))`,
        [newId(), x.id, JSON.stringify({ from: x.from, to: x.to, via: 'scripts/db-renombrar-kits.mjs' })],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  const { rows: after } = await client.query(`SELECT name FROM "Package" ORDER BY price, name`);
  console.log(`\n✔ Listo. Paquetes ahora: ${after.map((r) => `"${r.name}"`).join(', ')}\n`);
} finally {
  await client.end();
}
