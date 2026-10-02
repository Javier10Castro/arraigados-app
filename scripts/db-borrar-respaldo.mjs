// npm run db:borrar-respaldo -- respaldos/respaldo-XXXX.json
// Borra el ARCHIVO de respaldo (no toca la base). Úsalo cuando confirmes que
// todo salió bien y ya no lo necesitas. Sin argumento, lista los respaldos.
import fs from 'node:fs';
import path from 'node:path';
import { ask } from './_db.mjs';

const target = process.argv[2];
const dir = path.resolve('respaldos');

if (!target) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  console.log(files.length ? '\nRespaldos guardados:\n' + files.map((f) => `  respaldos/${f}`).join('\n') : '\nNo hay respaldos.');
  console.log('\nPara borrar uno: npm run db:borrar-respaldo -- respaldos/<archivo>.json\n');
  process.exit(0);
}

const file = path.resolve(target);
if (!file.startsWith(dir + path.sep) || !file.endsWith('.json') || !fs.existsSync(file)) {
  console.error('\n✖ Solo se pueden borrar archivos .json dentro de respaldos/.\n');
  process.exit(1);
}
const info = JSON.parse(fs.readFileSync(file, 'utf8'));
console.log(`\nRespaldo del ${info.creado} (${info.base})`);
const answer = await ask('Este archivo es la única forma de regresar los datos borrados. Escribe ELIMINAR para borrarlo: ');
if (answer !== 'ELIMINAR') {
  console.log('Cancelado. El respaldo sigue ahí.\n');
  process.exit(0);
}
fs.unlinkSync(file);
console.log(`✔ Respaldo eliminado: ${path.relative(process.cwd(), file)}\n`);
