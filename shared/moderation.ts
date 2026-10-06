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
  // ampliación (5 oct 2026) -- vulgaridades y insultos comunes en México
  'cagada', 'cagadas', 'cagon', 'cagona', 'ojete', 'ojetes', 'verguiza', 'vergota', 'cojones', 'cojudo', 'cojuda',
  'chinguen', 'chingue', 'chingues', 'chingamos', 'putita', 'putito', 'putillas', 'putaza', 'putero',
  'culiado', 'culiao', 'culiar', 'lameculos', 'pajero', 'pajera', 'huevon', 'huevona',
  'mongolo', 'sidoso', 'bastardo', 'bastarda', 'pendejete', 'cabroncito', 'cabroncita',
  'hdtm', 'hdlgp', 'vtlv', 'ptmr', 'chtm',
  'hdp', 'hdpm', 'ptm', 'ctm', 'csm', 'vrg', 'wtf', 'stfu',
  // inglés
  'fuck', 'fucker', 'fucking', 'fuckin', 'motherfucker', 'shit', 'shitty', 'bullshit', 'bitch', 'bitches',
  'asshole', 'dick', 'dickhead', 'cunt', 'whore', 'slut', 'bastard', 'nigger', 'nigga', 'fag', 'faggot', 'retard',
  'pussy', 'cocksucker', 'dumbass', 'jackass', 'wanker', 'twat', 'piss', 'pissed', 'dammit', 'goddamn',
]);

/** Raíces largas (≥6) y poco ambiguas: bloquean cualquier palabra que EMPIECE así. */
const STEMS = ['pendej', 'chingad', 'chingon', 'mierd', 'cabron', 'putaz', 'putamadre', 'maricon', 'fuck', 'motherf', 'hijueput', 'malpari'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '€': 'e' };

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const collapse = (s: string) => s.replace(/(.)\1+/g, '$1'); // puuuta -> puta (también "ll","rr": ok al comparar)

/**
 * Pliegue fonético, igual para la lista y para el texto: así "kabron"/"cabron", "fuk"/"fuck"/"phuck",
 * "berga"/"verga" se leen igual. Solo se compara contra palabras prohibidas, nunca se muestra.
 */
const fold = (s: string) => collapse(s.replace(/ph/g, 'f').replace(/k/g, 'c').replace(/v/g, 'b'));

/** Letras de otros alfabetos que se ven igual que las latinas (cirílico/griego): "рuta" con р cirílica. */
const HOMOGLYPH: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', і: 'i', ѕ: 's', ј: 'j', к: 'k', м: 'm', н: 'h', т: 't', в: 'b',
  α: 'a', ε: 'e', ι: 'i', ο: 'o', ρ: 'p', τ: 't', υ: 'u', κ: 'k', ν: 'v',
};
const INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

/** minúsculas, ancho completo -> normal, sin caracteres invisibles, sin acentos, homoglifos -> latinas. */
function prep(input: string): string {
  const t = strip(String(input ?? '').normalize('NFKC').replace(INVISIBLE, '').toLowerCase());
  return [...t].map((ch) => HOMOGLYPH[ch] ?? ch).join('').replace(/_/g, ' ');
}

function normalizeWord(w: string): string {
  const l = [...w].map((ch) => LEET[ch] ?? ch).join('');
  return fold(collapse(l.replace(/[^a-zñ]/g, '')));
}

// La lista también se colapsa, para que "chinga" y "chingaa" coincidan igual.
const WORDS_N = new Set([...WORDS].map((w) => fold(collapse(strip(w)))));
const STEMS_N = STEMS.map((s) => fold(collapse(strip(s))));

/**
 * Devuelve true si el texto contiene lenguaje no permitido.
 * (Devuelve solo un booleano a propósito: nunca repetimos la palabra al usuario.)
 */
export function hasBlockedLanguage(input: string, extra?: ExtraBlocked): boolean {
  const base = prep(input);
  const hit = (n: string) =>
    !!n && (WORDS_N.has(n) || STEMS_N.some((s) => n.startsWith(s)) || !!extra?.words.has(n));
  const ALPHA = 'abcdefghijklmnopqrstuvwxyzñ';
  const VOWELS = 'aeiou';
  const check = (raw: string) => {
    // Dos lecturas: con leetspeak ("$hit", "p3nd3j0") y sin símbolos pegados en las
    // puntas ("culero!!", "¡puta!" -- ahí "!" es puntuación, no una "i").
    if (hit(normalizeWord(raw)) || hit(normalizeWord(raw.replace(/^[!@$€*#?]+|[!@$€*#?]+$/g, '')))) return true;
    // Comodines: "p*ta", "f*ck", "put#" -- un carácter tachado por "*", "#" o "?" dentro de la palabra.
    const core = raw.replace(/^[!@$€]+|[!@$€]+$/g, ''); // los comodines de las puntas también cuentan ("*sshole")
    const wild = (core.match(/[*#?]/g) ?? []).length;
    if (wild >= 1 && wild <= 2) {
      const letters = wild === 1 ? ALPHA : VOWELS;
      const fill = (word: string): string[] =>
        word.includes('*') || word.includes('#') || word.includes('?')
          ? [...letters].flatMap((l) => fill(word.replace(/[*#?]/, l)))
          : [word];
      return fill(core).some((c) => hit(normalizeWord(c)));
    }
    return false;
  };
  // 1) palabras tal cual (separadas por cualquier cosa que no sea letra/número/leet/comodín)
  const tokens = base.split(/[^a-zñ0-9@$!€*#?]+/).filter(Boolean);
  if (tokens.some(check)) return true;
  // 2) letras sueltas separadas: "p u t a", "p.u.t.a", "c-h-i-n-g-a", "p . u . t . a"
  const spaced = base.match(/(?:^|[^a-zñ0-9])(?:[a-zñ0-9@$*#]\W{1,3}){2,}[a-zñ0-9@$*#](?![a-zñ0-9])/g);
  if (spaced?.some((run) => check(run.replace(/[^a-zñ0-9@$*#]/g, '')))) return true;
  // 3) palabra partida por espacios en trozos cortos: "pu ta", "ver ga", "pen dejo" (cada trozo ≤ 3 letras,
  //    salvo el último). Se limita a trozos cortos para no juntar palabras normales.
  const words = tokens;
  for (let i = 0; i < words.length; i++) {
    if (words[i].length > 3) continue;
    let joined = words[i];
    for (let j = i + 1; j < words.length && j <= i + 3; j++) {
      joined += words[j];
      if (joined.length >= 4 && check(joined)) return true;
      if (words[j].length > 3) break;
    }
  }
  // 4) frases pegadas sin espacios ("chingatumadre", "hijodeputa") ya cubiertas por WORDS;
  //    y "hijo de puta" / "tu madre" con separadores: se junta el texto y se buscan frases.
  const squashed = fold(collapse(base.replace(/[^a-zñ]/g, '')));
  return PHRASES_N.some((p) => squashed.includes(p)) || !!extra?.phrases.some((p) => squashed.includes(p));
}

/**
 * Palabras/frases que agrega el Admin desde /admin/notas (tabla "BlockedWord").
 * Se compilan una vez con `compileBlockedWords` y se pasan a `hasBlockedLanguage`:
 *  - una sola palabra  -> coincide como PALABRA COMPLETA (misma normalización: sin
 *    acentos, leetspeak, letras repetidas), así "mil" no bloquea "milagro";
 *  - varias palabras   -> se busca como frase sobre el texto sin espacios.
 */
export type ExtraBlocked = { words: Set<string>; phrases: string[] };

export function compileBlockedWords(list: readonly string[]): ExtraBlocked {
  const words = new Set<string>();
  const phrases: string[] = [];
  for (const raw of list) {
    const base = prep(String(raw ?? '')).trim();
    if (!base) continue;
    if (/\s/.test(base)) {
      const squashed = fold(collapse(base.replace(/[^a-zñ]/g, '')));
      if (squashed.length >= 4) phrases.push(squashed);
    } else {
      const n = normalizeWord(base);
      if (n.length >= 2) words.add(n);
    }
  }
  return { words, phrases };
}

/** Frases compuestas (se buscan sobre el texto sin espacios; son largas, sin falsos positivos). */
const PHRASES = [
  'hijo de puta', 'hija de puta', 'hijos de puta', 'tu puta madre', 'vete a la verga', 'vales verga', 'vale verga', 'chupame', 'mamame',
  'a la chingada', 'a la mierda', 'me vale madres', 'valgo madres', 'vales madres', 'ni madres',
];
const PHRASES_N = PHRASES.map((p) => fold(collapse(strip(p).replace(/[^a-zñ]/g, ''))));

/** Lista fija, solo para MOSTRARLA en Admin (solo lectura). */
export const FIXED_BLOCKED = {
  words: [...WORDS].sort((a, b) => a.localeCompare(b)),
  stems: [...STEMS],
  phrases: [...PHRASES],
};

export const BLOCKED_LANGUAGE_MESSAGE = 'Tu nota tiene lenguaje no permitido. Cámbialo y vuelve a intentar.';
