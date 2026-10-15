// npm run db:fotos-huerfanas            -> SOLO LEE: compara las fotos de Netlify Blobs con la base y lista las huérfanas.
// npm run db:fotos-huerfanas -- --borrar -> además borra las huérfanas (pide escribir BORRAR).
//
// Una foto queda huérfana cuando se borró al asistente (desvincular pulsera, borrar lote, db:limpiar-pruebas)
// pero Netlify Blobs falló al borrar el archivo, o cuando se limpió la base con el script. El archivo no se puede
// ver (no hay fila que lo apunte y las URL firmadas caducan en 24-48 h), pero sigue ocupando espacio y es un dato
// personal que debe eliminarse. En el log del servidor aparecen como `[profile:huerfana] key=...`.
//
// Credenciales (NUNCA se imprimen ni se guardan; ponlas solo en tu .env local, que git ignora):
//   NETLIFY_SITE_ID      id del sitio (Netlify → Site configuration → Site ID)
//   NETLIFY_AUTH_TOKEN   token personal de Netlify con acceso a ese sitio
// Seguridad: solo toca llaves con el formato de este módulo; no borra nada de menos de 1 hora (subida en curso);
// por defecto no cambia nada. Para NO afectar a producción usa el sitio/rama de pruebas.
import { connect, ask } from './_db.mjs';
import { openNetlifyStore } from './_respaldo.mjs';
import { classifyPhotos } from './_fotos.mjs';

const borrar = process.argv.includes('--borrar');
const { client, host, database } = connect(); // también carga .env
// Mismas credenciales y mismo acceso a Blobs que db:respaldo-total (openNetlifyStore); null = faltan en el .env.
const store = await openNetlifyStore('profile-photos');
if (!store) {
  console.error('\n✖ Faltan NETLIFY_SITE_ID y/o NETLIFY_AUTH_TOKEN en el .env (ver comentario al inicio de este script).\n');
  process.exit(1);
}

await client.connect();
try {
  console.log(`Base: ${database} @ ${host}   |   almacén de Blobs: profile-photos  (solo lectura${borrar ? ', salvo --borrar' : ''})`);
  const has = (await client.query(`SELECT to_regclass('public."AttendeeProfile"') AS t`)).rows[0].t;
  const referenced = has ? (await client.query(`SELECT "photoKey" FROM "AttendeeProfile" WHERE "photoKey" IS NOT NULL`)).rows.map((r) => r.photoKey) : [];

  const blobs = [];
  for await (const page of store.list({ paginate: true })) {
    for (const b of page.blobs) {
      const meta = await store.getMetadata(b.key).catch(() => null);
      blobs.push({ key: b.key, createdAt: meta?.metadata?.createdAt ?? null });
    }
  }

  const r = classifyPhotos(blobs, referenced);
  console.log(`\nArchivos en el almacén: ${blobs.length}   |   Filas con foto: ${referenced.length}`);
  console.log(`Huérfanos (se pueden borrar): ${r.orphans.length}`);
  for (const k of r.orphans) console.log(`  - ${k}`);
  if (r.tooRecent.length) console.log(`Sin fila pero de hace menos de 1 h (no se tocan, vuelve a correr luego): ${r.tooRecent.length}`);
  if (r.foreign.length) console.log(`Llaves con otro formato (nunca se tocan): ${r.foreign.length}`);
  if (r.missing.length) console.log(`⚠ Filas que apuntan a un archivo que NO existe (referencia rota, solo informativo): ${r.missing.length}`);

  if (!borrar || !r.orphans.length) {
    console.log(r.orphans.length ? '\nNo se borró nada. Para borrar las huérfanas:  npm run db:fotos-huerfanas -- --borrar\n' : '\nNada que limpiar.\n');
  } else {
    const answer = await ask(`\nEscribe BORRAR para eliminar ${r.orphans.length} archivo(s) huérfano(s) (cualquier otra cosa cancela): `);
    if (answer !== 'BORRAR') {
      console.log('Cancelado. No se borró nada.\n');
    } else {
      let ok = 0;
      for (const k of r.orphans) {
        try {
          await store.delete(k);
          ok += 1;
        } catch (err) {
          console.error(`  ✖ ${k}: ${err instanceof Error ? err.message : err}`);
        }
      }
      console.log(`\nBorrados ${ok} de ${r.orphans.length}. Vuelve a correr el script sin --borrar para verificar.\n`);
    }
  }
} finally {
  await client.end();
}
