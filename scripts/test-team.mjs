// npm run test:team -- pruebas de pulseras de equipo y autocanje (tests/team-pulse). Necesita TEST_DATABASE_URL
// (PostgreSQL DESECHABLE en localhost, base "arraigados_test*"). Nunca la apuntes a Neon. Ver scripts/test-ratelimit.mjs.
import { build } from 'esbuild';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
// --sin-011: crea la base de pruebas SIN la migración 011 (rate limit) para comprobar que 012 y el código no dependen de ella.
if (process.argv.includes('--sin-011')) process.env.TEST_WITHOUT_011 = '1';
const files = readdirSync('tests/team-pulse').filter((f) => f.endsWith('.test.mts'));
if (!process.env.TEST_DATABASE_URL) console.warn('\n[aviso] TEST_DATABASE_URL no está definida: las pruebas se OMITIRÁN.\n');
const outdir = path.join('node_modules', '.cache', 'team-tests');
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });
await build({ entryPoints: files.map((f) => path.join('tests/team-pulse', f)), outdir, bundle: true, platform: 'node', format: 'esm', target: 'node20', packages: 'external', outExtension: { '.js': '.mjs' }, logLevel: 'warning' });
let failed = false;
const stream = run({ files: files.map((f) => path.resolve(outdir, f.replace(/\.mts$/, '.mjs'))), concurrency: 1 });
stream.on('test:fail', () => { failed = true; });
stream.compose(spec).pipe(process.stdout);
await new Promise((r) => stream.on('end', r));
process.exitCode = failed ? 1 : 0;
