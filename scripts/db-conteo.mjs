// npm run db:conteo  -- SOLO LECTURA: cuántos datos de prueba hay en la base.
import { connect, contextCounts, counts, printCounts } from './_db.mjs';

const { client, host, database } = connect();
await client.connect();
try {
  console.log(`Base: ${database} @ ${host}`);
  printCounts('Datos de pruebas (lo que respaldan/limpian los otros scripts):', await counts(client));
  printCounts('Catálogos (nunca se tocan):', await contextCounts(client));
  const { rows } = await client.query(
    `SELECT status::text, count(*)::int AS n FROM "Pulse" GROUP BY status ORDER BY status`,
  );
  console.log('\nPulseras por estado:', rows.length ? rows.map((r) => `${r.status}: ${r.n}`).join(' · ') : 'ninguna');
  console.log('');
} finally {
  await client.end();
}
