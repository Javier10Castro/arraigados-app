// Solo lectura: pulseras por lote, estado del lote, kit y estado de la pulsera.
import { connect } from './_db.mjs';
const { client, host, database } = connect();
await client.connect();
console.log(`\nBase: ${database} @ ${host}\n`);
const r = await client.query(`SELECT b.code AS lote, b.status AS estado_lote, k.name AS kit, p.status::text AS estado_pulsera, count(*)::int AS n
  FROM "Pulse" p JOIN "Batch" b ON b.id = p."batchId" JOIN "Package" k ON k.id = p."packageId"
  GROUP BY 1,2,3,4 ORDER BY 1,4`);
console.table(r.rows);
console.log('Total pulseras:', r.rows.reduce((s, x) => s + x.n, 0), '\n');
await client.end();
