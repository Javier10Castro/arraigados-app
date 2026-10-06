// Utilidades del RESPALDO TOTAL (npm run db:respaldo-total / db:restaurar-total / db:limpiar-pruebas).
// Funciones puras que reciben un cliente `pg` ya conectado (o una tienda de fotos), para poder probarlas.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const FOTO_STORES = ['dish-photos', 'merch-photos'];
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Todas las tablas de la base (esquema public), sin importar si son nuevas o viejas. */
export async function listTables(client) {
  const { rows } = await client.query(
    `SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  return rows.map((r) => r.name);
}

/** Ordena las tablas "padres primero" según las llaves foráneas (para insertar sin chocar). */
export async function orderByDependency(client, tables) {
  const { rows } = await client.query(
    `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
       FROM pg_constraint c
      WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace`,
  );
  const clean = (n) => n.replace(/^"|"$/g, '').replace(/^public\./, '').replace(/^"|"$/g, '');
  const set = new Set(tables);
  const deps = new Map(tables.map((t) => [t, new Set()]));
  for (const { child, parent } of rows) {
    const c = clean(child);
    const p = clean(parent);
    if (c !== p && set.has(c) && set.has(p)) deps.get(c).add(p);
  }
  const out = [];
  const left = new Set(tables);
  while (left.size) {
    const ready = [...left].filter((t) => [...deps.get(t)].every((d) => !left.has(d))).sort();
    if (!ready.length) throw new Error(`Dependencias circulares entre: ${[...left].join(', ')}`);
    for (const t of ready) {
      out.push(t);
      left.delete(t);
    }
  }
  return out;
}

export async function countRows(client, tables) {
  const out = {};
  for (const t of tables) out[t] = (await client.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n;
  return out;
}

/** Foto consistente de TODAS las tablas. row_to_json conserva fechas, enums y JSON tal cual. */
export async function dumpAll(client) {
  const tables = await listTables(client);
  const orden = await orderByDependency(client, tables);
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const data = {};
    for (const t of orden) {
      const { rows } = await client.query(
        `SELECT coalesce(json_agg(row_to_json(x)), '[]'::json) AS rows FROM (SELECT * FROM "${t}") x`,
      );
      data[t] = rows[0].rows;
    }
    const conteo = await countRows(client, orden);
    await client.query('COMMIT');
    for (const t of orden) if (data[t].length !== conteo[t]) throw new Error(`Conteo distinto en ${t}; vuelve a intentar.`);
    return { orden, data, conteo };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

const safeName = (key) => encodeURIComponent(key).replace(/%/g, '_');

/** Copia las fotos (Netlify Blobs) a <dir>/fotos/<store>/. `openStore(name)` devuelve la tienda o null. */
export async function respaldarFotos(dir, openStore, stores = FOTO_STORES) {
  const index = {};
  for (const name of stores) {
    const store = await openStore(name);
    if (!store) return null;
    index[name] = [];
    const folder = path.join(dir, 'fotos', name);
    fs.mkdirSync(folder, { recursive: true });
    for await (const page of store.list({ paginate: true })) {
      for (const { key } of page.blobs) {
        const got = await store.getWithMetadata(key, { type: 'arrayBuffer' });
        if (!got) continue;
        const buf = Buffer.from(got.data);
        const file = safeName(key);
        fs.writeFileSync(path.join(folder, file), buf);
        index[name].push({ key, file, bytes: buf.length, sha256: sha256(buf), metadata: got.metadata ?? {} });
      }
    }
  }
  return index;
}

/** Vuelve a subir las fotos del respaldo. Devuelve cuántas subió. */
export async function restaurarFotos(dir, index, openStore) {
  let n = 0;
  for (const [name, items] of Object.entries(index ?? {})) {
    const store = await openStore(name);
    if (!store) return null;
    for (const it of items) {
      const buf = fs.readFileSync(path.join(dir, 'fotos', name, it.file));
      if (sha256(buf) !== it.sha256) throw new Error(`Foto dañada en el respaldo: ${name}/${it.key}`);
      await store.set(it.key, buf, { metadata: it.metadata });
      n++;
    }
  }
  return n;
}

/** Netlify Blobs desde un script: necesita NETLIFY_SITE_ID y NETLIFY_AUTH_TOKEN (ver .env.example). */
export async function openNetlifyStore(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) return null;
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name, siteID, token, consistency: 'strong' });
}

/**
 * Crea la carpeta de respaldo: <raiz>/<prefijo>-<fecha>/{datos.json, fotos/...}.
 * Verifica releyendo el archivo (conteos + huella). Devuelve { dir, file, kb, conteo, fotos }.
 */
export async function crearRespaldoTotal(client, { base, openStore = openNetlifyStore, prefijo = 'total', raiz = 'respaldos' } = {}) {
  const { orden, data, conteo } = await dumpAll(client);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const dir = path.resolve(raiz, `${prefijo}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const fotos = await respaldarFotos(dir, openStore);
  const body = {
    version: 2,
    tipo: 'total',
    creado: new Date().toISOString(),
    base,
    orden,
    conteo,
    sha256: sha256(JSON.stringify(data)),
    fotos, // null = no se pudieron respaldar (faltan NETLIFY_SITE_ID / NETLIFY_AUTH_TOKEN)
    data,
  };
  const file = path.join(dir, 'datos.json');
  fs.writeFileSync(file, JSON.stringify(body));
  const check = verificarRespaldo(dir);
  return { dir, file, kb: fs.statSync(file).size / 1024, conteo: check.conteo, fotos, orden };
}

/** Relee un respaldo y comprueba que esté completo. Lanza si algo no cuadra. */
export function verificarRespaldo(dir) {
  const file = path.join(dir, 'datos.json');
  if (!fs.existsSync(file)) throw new Error(`No existe ${file}`);
  const b = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (b.version !== 2 || b.tipo !== 'total') throw new Error('Ese archivo no es un respaldo total (¿es de db:respaldo?).');
  if (sha256(JSON.stringify(b.data)) !== b.sha256) throw new Error('El respaldo está dañado (la huella no coincide).');
  for (const t of b.orden) {
    if ((b.data[t] ?? []).length !== b.conteo[t]) throw new Error(`El respaldo no quedó completo (${t}).`);
  }
  for (const [store, items] of Object.entries(b.fotos ?? {})) {
    for (const it of items) {
      const f = path.join(dir, 'fotos', store, it.file);
      if (!fs.existsSync(f) || sha256(fs.readFileSync(f)) !== it.sha256) throw new Error(`Falta o está dañada la foto ${store}/${it.key}`);
    }
  }
  return b;
}

export function printTable(title, obj) {
  console.log(`\n${title}`);
  for (const [k, v] of Object.entries(obj)) console.log(`  ${k.padEnd(22)} ${String(v).padStart(6)}`);
}
