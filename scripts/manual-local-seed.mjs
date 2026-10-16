// npm run test:manual:seed -- prepara una base PostgreSQL LOCAL desechable para la prueba manual en navegador
// (docs/EQUIPO_PULSERA_AUTOCANJE.md, "Prueba manual en navegador"). Nunca toca Neon:
// exige MANUAL_DATABASE_URL en localhost/127.0.0.1 con nombre de base "arraigados_test*" y NO lee DATABASE_URL ni .env.
// ATENCIÓN: BORRA y recrea todo el esquema "public" de esa base.
import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const raw = process.env.MANUAL_DATABASE_URL;
if (!raw) {
  console.error('✖ Define MANUAL_DATABASE_URL, p. ej. postgres://postgres:CLAVE@localhost:5432/arraigados_test_manual (base LOCAL vacía y desechable).');
  process.exit(1);
}
const outdir = path.join('node_modules', '.cache', 'manual-seed');
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });
await build({ entryPoints: ['tests/team-pulse/testdb.mts'], outdir, bundle: true, platform: 'node', format: 'esm', target: 'node20', packages: 'external', outExtension: { '.js': '.mjs' }, logLevel: 'warning' });
const { assertSafeTestDatabase, resetTeamDatabase } = await import(pathToFileURL(path.resolve(outdir, 'testdb.mjs')).href);
const bcrypt = (await import('bcryptjs')).default;

const url = assertSafeTestDatabase(raw); // aborta si no es localhost + arraigados_test*
const db = await resetTeamDatabase(url);
const h = (p) => bcrypt.hashSync(p, 10);
const OWNER = { email: 'manual-owner@arraigados.local', password: 'Owner-manual-1' };
const ADMIN = { email: 'manual-admin@arraigados.local', password: 'Admin-manual-1' };
const STAFF = { email: 'manual-staff@arraigados.local', password: 'Staff-manual-1' };
await db.query(`INSERT INTO "Zone"(id,name) VALUES ('mz1','Zona manual')`);
await db.query(`INSERT INTO "Presbytery"(id,name,"zoneId") VALUES ('mp1','Presbiterio manual','mz1')`);
await db.query(`INSERT INTO "Church"(id,name,"presbyteryId") VALUES ('mc1','Iglesia manual','mp1')`);
await db.query(`INSERT INTO "Package"(id,name,price,"includedDrinks","updatedAt") VALUES ('mk3','Paquete manual (3 bebidas)',10000,3,now())`);
await db.query(
  `INSERT INTO "User"(id,email,name,role,active,"passwordHash","updatedAt") VALUES
   ('mu_owner',$1,'Dueño manual','ADMIN',true,$4,now()),('mu_admin',$2,'Admin manual','ADMIN',true,$5,now()),('mu_staff',$3,'Staff manual','STAFF',true,$6,now())`,
  [OWNER.email, ADMIN.email, STAFF.email, h(OWNER.password), h(ADMIN.password), h(STAFF.password)],
);
await db.query(`INSERT INTO "Batch"(id,code,"packageId",quantity,"createdById") VALUES ('mb1','LOTE-MANUAL','mk3',4,'mu_owner')`);
const pulses = [1, 2, 3, 4].map((i) => ({ id: `mpu${i}`, token: `MANUALPULSETOK${String(i).padStart(2, '0')}`, code: `AR26-M${i + 1}M${i + 1}M` }));
for (const p of pulses) await db.query(`INSERT INTO "Pulse"(id,"qrToken","manualCode","packageId","batchId","updatedAt") VALUES ($1,$2,$3,'mk3','mb1',now())`, [p.id, p.token, p.code]);
await db.end();
console.log(`\n✔ Base local lista: ${url.pathname.slice(1)} @ ${url.hostname} (migraciones 002–012 aplicadas; la 011 también, solo aquí).`);
console.log('\nCuentas (solo existen en esta base local):');
for (const [n, c] of [['Propietario', OWNER], ['Admin', ADMIN], ['Staff', STAFF]]) console.log(`  ${n.padEnd(12)} ${c.email}   ${c.password}`);
console.log('\nPulseras SIN reclamar (lote LOTE-MANUAL):');
for (const p of pulses) console.log(`  ${p.code}   QR: /p/${p.token}`);
console.log('\nArranca la app con:  OWNER_EMAIL=' + OWNER.email + ' (ver guía) y la base local en DATABASE_URL.\n');
