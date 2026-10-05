/**
 * Búsqueda automática de fotos para platillos sin foto (3 oct 2026), vía la
 * API pública de Openverse (openverse.org -- catálogo de imágenes con
 * licencia Creative Commons, agrega Flickr/Wikimedia/etc.). Sin API key: no
 * requiere cuenta (decisión explícita de Javier, a diferencia de Pixabay).
 *
 * Sin filtro de licencia (decisión explícita de Javier, 3 oct 2026: esto es
 * para uso interno del congreso, no hace falta restringirse a CC0/dominio
 * público) -- se acepta cualquier licencia que Openverse tenga catalogada
 * (todo su catálogo es Creative Commons o dominio público; nunca material
 * con todos los derechos reservados). license/creator/sourceUrl se siguen
 * guardando y mostrando al admin en la vista previa por si algún día hace
 * falta dar crédito, pero hoy nada en la app lo exige.
 */

const OPENVERSE_SEARCH_URL = 'https://api.openverse.org/v1/images/';
// 10, no 6 -- "Buscar otra" (ver Menu.tsx) reusa esta misma búsqueda
// excluyendo las fotos ya mostradas, así que conviene traer más candidatos
// desde el principio para que haya de dónde elegir la "siguiente".
const MAX_CANDIDATES = 10;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // mismo límite que la subida manual
const FETCH_TIMEOUT_MS = 8000;

const CONTENT_TYPE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

type OpenverseResult = {
  id: string;
  title: string;
  url: string;
  creator: string | null;
  license: string;
  license_version: string | null;
  foreign_landing_url: string;
  filetype: string | null;
};

export type FoundImage = {
  bytes: ArrayBuffer;
  contentType: string;
  ext: string;
  title: string;
  creator: string | null;
  license: string;
  sourceUrl: string;
  /** Id de Openverse -- se usa para que una búsqueda siguiente ("Buscar otra") pueda excluirla. */
  sourceId: string;
};

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Busca en Openverse y regresa la primera foto utilizable (JPG/PNG/WebP,
 * <4MB) que NO esté en `excludeIds`, o null si no encuentra ninguna.
 *
 * `excludeIds` es cómo "Buscar otra" (ver Menu.tsx / autoFetchDishImage)
 * evita repetir una foto que el admin ya vio y descartó: la misma búsqueda
 * (mismo texto) regresa los mismos resultados en el mismo orden, así que sin
 * esto, reintentar siempre encontraba la primera foto de nuevo.
 */
export async function searchOpenverseImage(query: string, excludeIds: string[] = []): Promise<FoundImage | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const excluded = new Set(excludeIds);

  const url = `${OPENVERSE_SEARCH_URL}?${new URLSearchParams({
    q: trimmed,
    mature: 'false',
    page_size: String(MAX_CANDIDATES),
  })}`;

  let results: OpenverseResult[];
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: OpenverseResult[] };
    results = data.results ?? [];
  } catch (err) {
    console.error('[openverse] búsqueda falló', err);
    return null;
  }

  for (const candidate of results) {
    if (!candidate.url || excluded.has(candidate.id)) continue;
    try {
      const imgRes = await fetchWithTimeout(candidate.url);
      if (!imgRes.ok) continue;
      const contentType = (imgRes.headers.get('content-type') ?? '').split(';')[0].trim();
      const ext = CONTENT_TYPE_EXT[contentType];
      if (!ext) continue; // SVG, GIF u otro formato que no aceptamos -- probar el siguiente candidato

      const buf = await imgRes.arrayBuffer();
      if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) continue;

      return {
        bytes: buf,
        contentType,
        ext,
        title: candidate.title || trimmed,
        creator: candidate.creator || null,
        license: candidate.license_version ? `${candidate.license} ${candidate.license_version}` : candidate.license,
        sourceUrl: candidate.foreign_landing_url,
        sourceId: candidate.id,
      };
    } catch (err) {
      console.error('[openverse] no se pudo descargar un candidato, probando el siguiente', err);
      continue;
    }
  }

  return null;
}
