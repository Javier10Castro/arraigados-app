// Likes de PRUEBA para ver la campana de /home (notificaciones "X le ha dado like a tu nota").
// NO es una migración: no cambia la estructura de la base, solo agrega (y luego borra) filas de prueba.
//
//   npm run db:likes-demo                        te muestra las notas ACTIVAS y eliges a cuál darle likes
//   npm run db:likes-demo -- --nombre=Javier     filtra la lista por nombre del dueño de la nota
//   npm run db:likes-demo -- --n=5               cuántos likes (1 a 8; por defecto 3)
//   npm run db:likes-demo -- --limpiar           borra SOLO lo creado por este script
//
// Los "likes" los dan asistentes demo (id que empieza con  demo-likes- ; no tienen pulsera, no salen en Lotes
// ni en los contadores de kits). Si ya habías corrido el script antes y los demo existen, se reutilizan.
// Con --n=1 verás "Ana le ha dado like a tu nota"; con 2 o más, "Ana y N más le dieron like a tu nota".
// Para probarlo: abre /home con la cuenta dueña de la nota y mira la campana (punto rojo + fila resaltada).
// Antes de tocar nada muestra a qué base se conecta y pide escribir SI.
import { ask, connect } from './_db.mjs';

const PREFIX = 'demo-likes-';
const NAMES = ['Ana', 'Luis', 'Valeria', 'Daniel', 'Camila', 'Isaac', 'Abigail', 'Samuel'];
const LASTS = ['Torres', 'López', 'Ruiz', 'Navarro', 'Cruz', 'Ortega', 'Silva', 'Reyes'];
const args = process.argv.slice(2);
const clean = args.includes('--limpiar');
const N = Math.min(8, Math.max(1, Number((args.find((a) => a.startsWith('--n=')) ?? '').slice(4)) || 3));
const FILTER = (args.find((a) => a.startsWith('--nombre=')) ?? '').slice(9).trim();
const NOW = `(now() AT TIME ZONE 'utc')`;

const { client, host, database } = connect();
await client.connect();
try {
  console.log(`\nBase de datos: ${database} en ${host}`);
  console.log(clean ? 'Acción: BORRAR los asistentes demo de likes (y los likes que dieron).' : `Acción: AGREGAR ${N} likes de asistentes demo a una nota activa que elijas.`);
  const go = (await ask('\nEscribe SI para continuar (cualquier otra cosa cancela): ')).toUpperCase();
  if (go !== 'SI') {
    console.log('Cancelado. No se cambió nada.');
    process.exit(0);
  }

  const has = (await client.query(`SELECT to_regclass('"NoteLike"') AS t`)).rows[0].t;
  if (!has) {
    console.error('\n✖ Falta la tabla "NoteLike". Corre primero:  npm run db:migrar\n');
    process.exit(1);
  }

  if (clean) {
    const r = await client.query(`DELETE FROM "Attendee" WHERE id LIKE $1`, [`${PREFIX}%`]);
    console.log(`\n✔ Borrados ${r.rowCount} asistentes demo (y sus likes).\n`);
    process.exit(0);
  }

  // Notas activas (las que aún se ven en el carrusel), con su dueño y likes actuales.
  const notes = (
    await client.query(
      `SELECT n.id, n."text", a."fullName", n."createdAt",
              (SELECT count(*)::int FROM "NoteLike" l WHERE l."noteId" = n.id) AS likes
         FROM "Note" n JOIN "Attendee" a ON a.id = n."attendeeId"
        WHERE n."expiresAt" > ${NOW} AND n."visibility" = 'PUBLIC'
          AND a.id NOT LIKE 'demo-%'
          AND ($1 = '' OR lower(a."fullName") LIKE '%' || lower($1) || '%')
        ORDER BY n."createdAt" DESC LIMIT 15`,
      [FILTER],
    )
  ).rows;
  if (!notes.length) {
    console.error(`\n✖ No hay notas activas${FILTER ? ` de "${FILTER}"` : ''} (las de asistentes demo no cuentan). Publica una nota en /home y vuelve a correr esto.\n`);
    process.exit(1);
  }
  console.log('\nNotas activas:');
  notes.forEach((n, i) => console.log(`  ${i + 1}) ${n.fullName} — “${n.text}” (${n.likes} likes)`));
  const pickN = Number(await ask('\n¿A cuál le doy likes? Escribe su número: '));
  const target = notes[pickN - 1];
  if (!target) {
    console.log('Número inválido. No se cambió nada.');
    process.exit(0);
  }

  const church = (await client.query(`SELECT id FROM "Church" ORDER BY id LIMIT 1`)).rows[0]?.id;
  if (!church) {
    console.error('\n✖ No hay iglesias en la base; no puedo crear asistentes demo.\n');
    process.exit(1);
  }

  await client.query('BEGIN');
  const ids = [];
  for (let i = 0; i < N; i++) {
    const id = `${PREFIX}${i + 1}`;
    ids.push(id);
    await client.query(
      `INSERT INTO "Attendee" (id, "fullName", "ageRange", "churchId", "createdAt", "updatedAt")
       VALUES ($1, $2, '16-18', $3, ${NOW}, ${NOW}) ON CONFLICT (id) DO NOTHING`,
      [id, `${NAMES[i]} ${LASTS[i]} (demo)`, church],
    );
  }
  // Escalonados: el like más reciente es "ahora" (el avatar y el nombre de la fila son los del más reciente: el último).
  let given = 0;
  for (let i = 0; i < N; i++) {
    const minsAgo = (N - 1 - i) * 3;
    const r = await client.query(
      `INSERT INTO "NoteLike" (id, "noteId", "attendeeId", "createdAt")
       VALUES ($1, $2, $3, ${NOW} - ($4 || ' minutes')::interval) ON CONFLICT ("noteId", "attendeeId") DO NOTHING`,
      [`${PREFIX}l-${target.id}-${i}`, target.id, ids[i], String(minsAgo)],
    );
    given += r.rowCount;
  }
  await client.query('COMMIT');
  console.log(`\n✔ ${given} likes nuevos en la nota de ${target.fullName} (${N - given} ya existían).`);
  console.log('  Ahora abre /home con esa cuenta y toca la campana.');
  console.log('  Para borrar lo de prueba:  npm run db:likes-demo -- --limpiar\n');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('\n✖ Falló:', err.message, '\n');
  process.exitCode = 1;
} finally {
  await client.end();
}
