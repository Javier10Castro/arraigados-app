// Datos de DEMOSTRACIÓN para ver Admin → Notas con volumen (asistentes + notas de mentira).
//
//   npm run db:notas-demo                 crea 60 asistentes demo con ~100 notas
//   npm run db:notas-demo -- --n=300      otra cantidad (máx. 500)
//   npm run db:notas-demo -- --limpiar    borra SOLO lo creado por este script
//
// Todo lo que crea lleva el id  demo-notas-…  y se borra por ese prefijo (las notas y los likes se
// van en cascada). NO crea lotes ni pulseras, así que no ensucia Lotes ni los contadores de kits.
// Sí aparecen en Admin → Asistentes (con nombre "… (demo)") mientras no los limpies.
// Antes de tocar nada muestra a qué base se conectaría y pide escribir SI.
import { ask, connect } from './_db.mjs';

const PREFIX = 'demo-notas-';
const args = process.argv.slice(2);
const clean = args.includes('--limpiar');
const N = Math.min(500, Math.max(5, Number((args.find((a) => a.startsWith('--n=')) ?? '').slice(4)) || 60));

const NAMES = ['Javier', 'María', 'José', 'Ana', 'Daniel', 'Valeria', 'Emmanuel', 'Camila', 'Isaac', 'Abigail', 'Samuel', 'Lucía', 'Gabriel', 'Karen', 'Josué', 'Paola', 'Mateo', 'Renata', 'Ángel', 'Nicole'];
const LASTS = ['Castro', 'López', 'Ramírez', 'Torres', 'Hernández', 'Gómez', 'Ruiz', 'Navarro', 'Morales', 'Cruz', 'Ortega', 'Mendoza', 'Silva', 'Vargas', 'Aguilar', 'Reyes', 'Castillo', 'Flores', 'Guzmán', 'Rangel'];
const AGES = ['16-18', '19-21', '22-24', '25-27', '28-30', '31-34', '35+'];
const PHRASES = ['Dios sigue obrando.', 'Colosenses 2:6-7', 'Arraigado en Cristo', 'Gracias Señor por este día', 'Lista para el congreso', 'Oren por mi familia', 'Todo lo puedo en Cristo', 'Su fidelidad es grande', 'Nos vemos en la plenaria', 'Con ganas de alabar', 'Paz que sobrepasa todo', 'Salmo 23 me sostiene', 'Hoy es un buen día para servir', 'Jesús es mi roca', 'Quiero conocer a más hermanos'];
const pick = (a, i) => a[i % a.length];
const NOW = `(now() AT TIME ZONE 'utc')`;

const { client, host, database } = connect();
await client.connect();
try {
  console.log(`\nBase de datos: ${database} en ${host}`);
  console.log(clean ? 'Acción: BORRAR los datos demo de notas (id que empieza con "demo-notas-").' : `Acción: CREAR ${N} asistentes demo y sus notas (no toca nada existente).`);
  const ok = (await ask('\nEscribe SI para continuar (cualquier otra cosa cancela): ')).toUpperCase();
  if (ok !== 'SI') {
    console.log('Cancelado. No se cambió nada.');
    process.exit(0);
  }

  const hasNotes = (await client.query(`SELECT to_regclass('"Note"') AS t`)).rows[0].t;
  if (!hasNotes) {
    console.error('\n✖ Falta la tabla "Note". Corre primero:  npm run db:migrar\n');
    process.exit(1);
  }

  if (clean) {
    const r = await client.query(`DELETE FROM "Attendee" WHERE id LIKE $1`, [`${PREFIX}%`]);
    console.log(`\n✔ Borrados ${r.rowCount} asistentes demo (y sus notas y likes).\n`);
  } else {
    const churches = (await client.query(`SELECT id FROM "Church" ORDER BY id`)).rows.map((r) => r.id);
    if (!churches.length) {
      console.error('\n✖ No hay iglesias en la base; no puedo crear asistentes.\n');
      process.exit(1);
    }
    const existing = (await client.query(`SELECT count(*)::int AS n FROM "Attendee" WHERE id LIKE $1`, [`${PREFIX}%`])).rows[0].n;
    if (existing) {
      console.error(`\n✖ Ya hay ${existing} asistentes demo. Límpialos primero:  npm run db:notas-demo -- --limpiar\n`);
      process.exit(1);
    }

    await client.query('BEGIN');
    const att = { id: [], name: [], age: [], church: [] };
    for (let i = 0; i < N; i++) {
      att.id.push(`${PREFIX}${String(i + 1).padStart(4, '0')}`);
      att.name.push(`${pick(NAMES, i * 7 + 3)} ${pick(LASTS, i * 3 + 1)} (demo)`);
      att.age.push(pick(AGES, i));
      att.church.push(pick(churches, i * 5));
    }
    await client.query(
      `INSERT INTO "Attendee" (id, "fullName", "ageRange", "churchId", "createdAt", "updatedAt")
       SELECT t.id, t.n, t.a, t.c, ${NOW}, ${NOW} FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[]) AS t(id, n, a, c)`,
      [att.id, att.name, att.age, att.church],
    );

    // Notas: cada asistente tiene 1-3. La ÚLTIMA está activa en ~2/3 de los casos (publicada hace 1-20 h);
    // las anteriores ya vencieron (algunas "quitadas/reemplazadas" a las pocas horas, otras por las 24 h).
    const note = { id: [], att: [], text: [], created: [], expires: [] };
    const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString().slice(0, 23).replace('T', ' ');
    let k = 0;
    for (let i = 0; i < N; i++) {
      const count = 1 + (i % 3);
      for (let j = 0; j < count; j++) {
        const latest = j === 0;
        const active = latest && i % 3 !== 2;
        const age = active ? (i % 20) + 1 : 26 + ((i * 7 + j * 19) % 60); // horas desde la publicación
        const lifetime = active ? 24 : j % 2 ? 3 : 24; // vencida: reemplazada a las 3 h, o por las 24 h
        note.id.push(`${PREFIX}n${String(++k).padStart(5, '0')}`);
        note.att.push(att.id[i]);
        note.text.push(pick(PHRASES, i * 3 + j));
        note.created.push(hoursAgo(age));
        note.expires.push(hoursAgo(age - lifetime));
      }
    }
    await client.query(
      `INSERT INTO "Note" (id, "attendeeId", "text", "visibility", "createdAt", "expiresAt")
       SELECT t.id, t.a, t.x, 'PUBLIC', t.c::timestamp, t.e::timestamp FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[]) AS t(id, a, x, c, e)`,
      [note.id, note.att, note.text, note.created, note.expires],
    );

    // Algunos likes (entre asistentes demo) para ver ese filtro.
    const like = { id: [], note: [], att: [] };
    for (let n = 0; n < note.id.length; n += 4) {
      for (let l = 0; l < (n % 3) + 1; l++) {
        const liker = att.id[(n + l + 1) % N];
        if (liker === note.att[n]) continue;
        like.id.push(`${PREFIX}l${n}-${l}`);
        like.note.push(note.id[n]);
        like.att.push(liker);
      }
    }
    await client.query(
      `INSERT INTO "NoteLike" (id, "noteId", "attendeeId", "createdAt")
       SELECT t.id, t.n, t.a, ${NOW} FROM UNNEST($1::text[], $2::text[], $3::text[]) AS t(id, n, a)`,
      [like.id, like.note, like.att],
    );
    await client.query('COMMIT');
    console.log(`\n✔ Creados ${N} asistentes demo, ${note.id.length} notas y ${like.id.length} likes.`);
    console.log('  Míralos en  /admin/notas  (reinicia nada: son datos normales de la base).');
    console.log('  Para borrarlos:  npm run db:notas-demo -- --limpiar\n');
  }
} catch (e) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error('\n✖ Falló:', e.message, '\n');
  process.exitCode = 1;
} finally {
  await client.end();
}
