// npm run test:ratelimit
//
// Pruebas del límite de frecuencia (server/rateLimit.ts y las rutas que lo usan). Sin dependencias nuevas:
// empaqueta tests/rate-limit/*.test.mts con esbuild (viene con Vite) y las corre con el módulo nativo `node:test`.
//
//  · unit.test.mts         -> no necesita base de datos.
//  · integration.test.mts  -> necesita una base PostgreSQL DESECHABLE en tu equipo. Define TEST_DATABASE_URL, por ejemplo:
//        postgres://postgres:postgres@127.0.0.1:5432/arraigados_test
//    Se NIEGA a correr si el host no es localhost o si el nombre de la base no empieza con "arraigados_test", porque
//    borra y recrea el esquema "public" de esa base. NUNCA la apuntes a Neon. Sin TEST_DATABASE_URL se omite (y lo avisa).
//
// Uso:  npm run test:ratelimit            (todo)
//       npm run test:ratelimit -- unit    (solo las unitarias)
import { build } from 'esbuild';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const only = process.argv[2];
const all = readdirSync('tests/rate-limit').filter((f) => f.endsWith('.test.mts'));
const files = all.filter((f) => !only || f.startsWith(only));
if (!files.length) {
  console.error(`No hay pruebas que coincidan con "${only}". Disponibles: ${all.join(', ')}`);
  process.exit(1);
}
if (files.some((f) => f.startsWith('integration')) && !process.env.TEST_DATABASE_URL) {
  console.warn('\n[aviso] TEST_DATABASE_URL no está definida: las pruebas de integración se OMITIRÁN (ver el encabezado de este archivo).\n');
}

// Dentro de node_modules/.cache para que los imports de paquetes (pg, etc.) se resuelvan; no se versiona.
const outdir = path.join('node_modules', '.cache', 'ratelimit-tests');
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: files.map((f) => path.join('tests/rate-limit', f)),
  outdir,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  outExtension: { '.js': '.mjs' },
  logLevel: 'warning',
});

// Se usa la API run() de node:test con rutas explícitas (el comando `node --test` ignora lo que está dentro de node_modules).
import { run } from 'node:test';
import { spec } from 'node:test/reporters';

let failed = false;
const stream = run({ files: files.map((f) => path.resolve(outdir, f.replace(/\.mts$/, '.mjs'))), concurrency: 1 });
stream.on('test:fail', () => {
  failed = true;
});
stream.compose(spec).pipe(process.stdout);
await new Promise((resolve) => stream.on('end', resolve));
process.exitCode = failed ? 1 : 0;
