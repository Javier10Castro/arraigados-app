// npm run db:respaldo-total
// Guarda en respaldos/total-AAAAMMDD-HHMM/ una copia de TODA la base (todas las tablas:
// usuarios, iglesias, paquetes, pulseras, asistentes, notas, menú, mercancía, beneficios, avisos,
// auditoría...) y, si hay credenciales de Netlify en .env, también las FOTOS de platillos y mercancía.
// Solo LEE: no cambia nada en Neon. El archivo contiene datos personales y hashes de contraseñas:
// guárdalo en un lugar privado (la carpeta respaldos/ está en .gitignore; NO la subas a GitHub).
import path from 'node:path';
import { connect } from './_db.mjs';
import { crearRespaldoTotal, printTable } from './_respaldo.mjs';

const { client, host, database } = connect();
await client.connect();
try {
  console.log(`Base: ${database} @ ${host}`);
  const r = await crearRespaldoTotal(client, { base: `${database} @ ${host}` });
  printTable(`Respaldado (${r.orden.length} tablas):`, r.conteo);
  const rel = path.relative(process.cwd(), r.dir);
  console.log(`\n✔ Respaldo guardado y verificado: ${rel}  (${r.kb.toFixed(1)} KB de datos)`);
  if (r.fotos) {
    const n = Object.values(r.fotos).reduce((a, l) => a + l.length, 0);
    console.log(`  Fotos incluidas: ${n} (${Object.entries(r.fotos).map(([s, l]) => `${s}: ${l.length}`).join(', ')})`);
  } else {
    console.log('\n⚠ Las FOTOS (platillos y mercancía) NO se incluyeron: faltan NETLIFY_SITE_ID y NETLIFY_AUTH_TOKEN en .env.');
    console.log('  Los datos sí quedaron completos. Para incluir fotos, ver docs/PLAN_RESPALDO.md.');
  }
  console.log(`\n  Para restaurar: npm run db:restaurar-total -- ${rel}`);
  console.log('  Guarda una copia de esa carpeta en OTRO lugar (disco externo o nube privada).\n');
} finally {
  await client.end();
}
