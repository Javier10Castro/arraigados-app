/**
 * Filtro de lenguaje para las Notas. Lo usan el cliente (feedback inmediato en
 * el editor) y el servidor (la verdadera barrera: el cliente se puede saltar).
 *
 * Diseño (conservador a propósito, para no bloquear palabras normales):
 *  - Se normaliza: minúsculas, sin acentos, leetspeak básico (p3nd3j0, put@, $hit),
 *    letras repetidas colapsadas (puuuuta) y letras separadas ("p u t a", "p.u.t.a").
 *  - La coincidencia es por PALABRA COMPLETA (o por raíz/prefijo solo en las
 *    raíces largas y seguras). Nunca por subcadena corta: "computadora" y
 *    "reputación" NO deben activar "puta".
 *  - La lista es un punto de partida: se amplía editando WORDS / STEMS.
 */

/** Palabras completas bloqueadas (ya normalizadas: sin acentos, sin repetidas). */
const WORDS = new Set([
  // español (MX)
  'puta', 'putas', 'puto', 'putos', 'putazo', 'putear', 'puteria', 'putamadre', 'putisima',
  'verga', 'vergas', 'vergon', 'vergazo',
  'chinga', 'chingas', 'chingo', 'chingar', 'chingada', 'chingado', 'chingadera', 'chingatumadre', 'chingon',
  'pendejo', 'pendeja', 'pendejos', 'pendejas', 'pendejada',
  'cabron', 'cabrona', 'cabrones', 'cabronazo',
  'culero', 'culera', 'culeros', 'culo', 'culos',
  'mierda', 'mierdas', 'mierdero',
  'joder', 'jodete', 'jodido', 'jodida',
  'carajo',
  'pinche', 'pinches',
  'marica', 'maricon', 'maricones', 'joto', 'jotos', 'puñal', 'punal',
  'zorra', 'zorras', 'malparido', 'malparida', 'gonorrea', 'hijueputa', 'hijoeputa', 'hijodeputa',
  'mamada', 'mamadas', 'tetas', 'nalgas', 'porno', 'pornografia', 'follar',
  'estupido', 'estupida', 'idiota', 'imbecil',
  'hdp', 'hdpm', 'ptm', 'ctm', 'csm', 'vrg', 'wtf', 'stfu',
  // inglés
  'fuck', 'fucker', 'fucking', 'fuckin', 'motherfucker', 'shit', 'shitty', 'bullshit', 'bitch', 'bitches',
  'asshole', 'dick', 'dickhead', 'cunt', 'whore', 'slut', 'bastard', 'nigger', 'nigga', 'fag', 'faggot', 'retard',
]);

/** Raíces largas (≥6) y poco ambiguas: bloquean cualquier palabra que EMPIECE así. */
const STEMS = ['pendej', 'chingad', 'chingon', 'mierd', 'cabron', 'putaz', 'putamadre', 'maricon', 'fuck', 'motherf', 'hijueput', 'malpari'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '€': 'e' };

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const collapse = (s: string) => s.replace(/(.)\1+/g, '$1'); // puuuta -> puta (también "ll","rr": ok al comparar)

function normalizeWord(w: string): string {
  const l = [...w].map((ch) => LEET[ch] ?? ch).join('');
  return collapse(l.replace(/[^a-zñ]/g, ''));
}

// La lista también se colapsa, para que "chinga" y "chingaa" coincidan igual.
const WORDS_N = new Set([...WORDS].map((w) => collapse(strip(w))));
const STEMS_N = STEMS.map((s) => collapse(strip(s)));

/**
 * Devuelve true si el texto contiene lenguaje no permitido.
 * (Devuelve solo un booleano a propósito: nunca repetimos la palabra al usuario.)
 */
export function hasBlockedLanguage(input: string): boolean {
  const base = strip(String(input ?? '').toLowerCase());
  // 1) palabras tal cual (separadas por cualquier cosa que no sea letra/número/leet)
  const tokens = base.split(/[^a-zñ0-9@$!€]+/).filter(Boolean);
  const check = (raw: string) => {
    // Dos lecturas: con leetspeak ("$hit", "p3nd3j0") y sin símbolos pegados en las
    // puntas ("culero!!", "¡puta!" -- ahí "!" es puntuación, no una "i").
    const hit = (n: string) => !!n && (WORDS_N.has(n) || STEMS_N.some((s) => n.startsWith(s)));
    return hit(normalizeWord(raw)) || hit(normalizeWord(raw.replace(/^[!@$€]+|[!@$€]+$/g, '')));
  };
  if (tokens.some(check)) return true;
  // 2) letras sueltas separadas: "p u t a", "p.u.t.a", "c-h-i-n-g-a"
  const spaced = base.match(/\b(?:[a-zñ0-9@$]\W{1,2}){2,}[a-zñ0-9@$]\b/g);
  if (spaced?.some((run) => check(run.replace(/[^a-zñ0-9@$]/g, '')))) return true;
  // 3) frases pegadas sin espacios internas ("chingatumadre", "hijodeputa") ya cubiertas por WORDS;
  //    y "hijo de puta" / "tu madre" con separadores: se junta el texto y se buscan frases.
  const squashed = collapse(base.replace(/[^a-zñ]/g, ''));
  return PHRASES_N.some((p) => squashed.includes(p));
}

/** Frases compuestas (se buscan sobre el texto sin espacios; son largas, sin falsos positivos). */
const PHRASES = ['hijo de puta', 'hija de puta', 'hijos de puta', 'tu puta madre', 'vete a la verga', 'vales verga', 'vale verga', 'chupame', 'mamame'];
const PHRASES_N = PHRASES.map((p) => collapse(strip(p).replace(/[^a-zñ]/g, '')));

export const BLOCKED_LANGUAGE_MESSAGE = 'Tu nota tiene lenguaje no permitido. Cámbialo y vuelve a intentar.';
