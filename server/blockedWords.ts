import { NOW_UTC, newId, query, withTransaction } from './db';
import { compileBlockedWords, type ExtraBlocked } from '../shared/moderation';
import type { BlockedWord } from '../shared/api';

/**
 * Palabras bloqueadas que agrega el Admin (tabla "BlockedWord", migración 005).
 * Se suman a la lista fija de shared/moderation.ts. Las usan el servidor al
 * publicar una nota y el feed del carrusel (para ocultar de inmediato notas
 * ya publicadas que contengan una palabra recién agregada).
 */

export const BLOCKED_WORD_MAX = 40;

export class BlockedWordError extends Error {}

/** Caché corta en memoria: el feed se consulta seguido y la lista casi nunca cambia. */
const TTL_MS = 30_000;
let cache: { at: number; value: ExtraBlocked } | null = null;

export function invalidateBlockedWordsCache() {
  cache = null;
}

/** Lista compilada para `hasBlockedLanguage`. Si la tabla aún no existe (migración sin aplicar), devuelve vacía. */
export async function getExtraBlocked(): Promise<ExtraBlocked> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value: ExtraBlocked;
  try {
    const { rows } = await query<{ word: string }>(`SELECT "word" FROM "BlockedWord"`);
    value = compileBlockedWords(rows.map((r) => r.word));
  } catch {
    // 42P01 = tabla inexistente: no tumbar las Notas por una migración pendiente.
    value = compileBlockedWords([]);
  }
  cache = { at: Date.now(), value };
  return value;
}

export async function listBlockedWords(): Promise<BlockedWord[]> {
  const { rows } = await query<{ id: string; word: string; createdAt: Date | string; createdByName: string | null }>(
    `SELECT b.id, b."word", b."createdAt", u."name" AS "createdByName"
       FROM "BlockedWord" b
       LEFT JOIN "User" u ON u.id = b."createdById"
      ORDER BY b."word" ASC`,
  );
  return rows.map((r) => ({
    id: r.id,
    word: r.word,
    createdAt: new Date(r.createdAt).toISOString(),
    createdByName: r.createdByName,
  }));
}

/** minúsculas, sin acentos (conserva la ñ), espacios simples. */
function cleanWord(raw: unknown): string {
  const w = String(raw ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ@$\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (w.length < 2) throw new BlockedWordError('Escribe al menos 2 letras.');
  if (w.length > BLOCKED_WORD_MAX) throw new BlockedWordError(`Máximo ${BLOCKED_WORD_MAX} caracteres.`);
  return w;
}

export async function addBlockedWord(actorId: string, raw: unknown): Promise<{ outcome: 'ok' | 'exists'; word: string }> {
  const word = cleanWord(raw);
  const outcome = await withTransaction(async (tx) => {
    const ins = await tx.query(
      `INSERT INTO "BlockedWord" (id, "word", "createdAt", "createdById")
       VALUES ($1, $2, ${NOW_UTC}, $3)
       ON CONFLICT ("word") DO NOTHING`,
      [newId(), word, actorId],
    );
    if (!ins.rowCount) return 'exists' as const;
    await tx.query(
      `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
       VALUES ($1, $2, 'blocked_word.add', 'BlockedWord', $3, $4::jsonb, ${NOW_UTC})`,
      [newId(), actorId, word, JSON.stringify({ word })],
    );
    return 'ok' as const;
  });
  invalidateBlockedWordsCache();
  return { outcome, word };
}

export async function removeBlockedWord(actorId: string, id: string): Promise<{ outcome: 'ok' | 'not_found' }> {
  const outcome = await withTransaction(async (tx) => {
    const del = await tx.query<{ word: string }>(`DELETE FROM "BlockedWord" WHERE id = $1 RETURNING "word"`, [id]);
    if (!del.rowCount) return 'not_found' as const;
    await tx.query(
      `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
       VALUES ($1, $2, 'blocked_word.remove', 'BlockedWord', $3, $4::jsonb, ${NOW_UTC})`,
      [newId(), actorId, del.rows[0].word, JSON.stringify({ word: del.rows[0].word })],
    );
    return 'ok' as const;
  });
  invalidateBlockedWordsCache();
  return { outcome };
}

/** Cambia el texto de una palabra de la lista del Admin (corregir un error de dedo). Alta/baja/cambio quedan en AuditLog. */
export async function updateBlockedWord(
  actorId: string,
  id: string,
  raw: unknown,
): Promise<{ outcome: 'ok' | 'exists' | 'not_found'; word: string }> {
  const word = cleanWord(raw);
  const outcome = await withTransaction(async (tx) => {
    const cur = await tx.query<{ word: string }>(`SELECT "word" FROM "BlockedWord" WHERE id = $1 FOR UPDATE`, [id]);
    if (!cur.rowCount) return 'not_found' as const;
    const before = cur.rows[0].word;
    if (before === word) return 'ok' as const; // sin cambios
    const clash = await tx.query(`SELECT 1 FROM "BlockedWord" WHERE "word" = $1 AND id <> $2`, [word, id]);
    if (clash.rowCount) return 'exists' as const;
    await tx.query(`UPDATE "BlockedWord" SET "word" = $1 WHERE id = $2`, [word, id]);
    await tx.query(
      `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt")
       VALUES ($1, $2, 'blocked_word.update', 'BlockedWord', $3, $4::jsonb, ${NOW_UTC})`,
      [newId(), actorId, word, JSON.stringify({ from: before, to: word })],
    );
    return 'ok' as const;
  });
  invalidateBlockedWordsCache();
  return { outcome, word };
}
