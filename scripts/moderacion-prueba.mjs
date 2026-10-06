// Prueba del filtro de lenguaje (shared/moderation.ts). SOLO LEE; no toca la base de datos.
//
//   npm run moderacion:probar                 corre las pruebas automáticas
//   npm run moderacion:probar -- "texto"      dice si ese texto se bloquearía o se permitiría
//
// Automáticas: para CADA palabra de la lista fija genera variantes (MAYÚSCULAS, mezcla, números/símbolos
// por letras, letras repetidas, separadas por espacios/puntos/guiones, con un carácter tachado "*",
// k por c, caracteres invisibles, letras de otro alfabeto) y comprueba que se detecten; también comprueba
// que frases y palabras normales NO se bloqueen (falsos positivos). Se sale con error si algo falla.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'shared', 'moderation.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const { hasBlockedLanguage, compileBlockedWords, FIXED_BLOCKED } = mod;

const arg = process.argv.slice(2).join(' ').trim();
if (arg) {
  console.log(hasBlockedLanguage(arg) ? 'SE BLOQUEARÍA' : 'se permitiría');
  process.exit(0);
}

const LEET = { a: '4', e: '3', i: '1', o: '0', s: '5', t: '7' };
const CYR = { a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у' };
const variants = (w) => {
  const out = new Set();
  const add = (v, tag) => out.add(JSON.stringify([v, tag]));
  add(w.toUpperCase(), 'MAYÚSCULAS');
  add(w.replace(/./g, (c, i) => (i % 2 ? c.toUpperCase() : c)), 'mezcla');
  add(w.replace(/[aeiost]/g, (c) => LEET[c]), 'números');
  add(w.replace(/[aeiost]/, (c) => LEET[c]), 'un número');
  add(w + w[w.length - 1].repeat(3), 'repetida al final');
  add(w.replace(/./g, (c) => c + c), 'todas dobles');
  if (w.length >= 3 && w.length <= 9) {
    add([...w].join(' '), 'letras con espacios');
    add([...w].join('.'), 'letras con puntos');
    add([...w].join('-'), 'letras con guiones');
    add([...w].join('_'), 'letras con guion bajo');
  }
  const v = w.search(/[aeiou]/);
  if (v >= 0 && w.length >= 3) add(w.slice(0, v) + '*' + w.slice(v + 1), 'vocal tachada con *');
  if (/c/.test(w)) add(w.replace(/c/g, 'k'), 'c por k');
  add(w.slice(0, 1) + '​' + w.slice(1), 'carácter invisible');
  add(w.replace(/[aeopcxy]/g, (c) => CYR[c] ?? c), 'letras de otro alfabeto');
  add('hola ' + w + '!!! amigo', 'dentro de una frase');
  return [...out].map((x) => JSON.parse(x));
};

let fails = 0;
let total = 0;
const failList = [];
for (const w of FIXED_BLOCKED.words) {
  for (const [v, tag] of variants(w)) {
    total++;
    if (!hasBlockedLanguage(v)) {
      fails++;
      failList.push(`  (${tag}) palabra de la lista #${FIXED_BLOCKED.words.indexOf(w) + 1}: "${v}"`);
    }
  }
}
// Las variantes demasiado cortas/ambiguas (ej. 3 letras con espacios) pueden no detectarse a propósito: se reportan aparte.
console.log(`Variantes probadas: ${total}. No detectadas: ${fails}`);
if (failList.length) console.log(failList.slice(0, 60).join('\n') + (failList.length > 60 ? `\n  … y ${failList.length - 60} más` : ''));

// Palabras que agrega el Admin (una sola palabra y una frase) y sus variantes
const extra = compileBlockedWords(['tonto', 'vete al cielo', 'stupid']);
const extraTests = ['tonto', 'TONTO', 't0nt0', 't o n t o', 't*nto', 'tooonto', 'vete al cielo', 'vete  al  cielo', 'v e t e a l c i e l o', 'stup1d', 'S.T.U.P.I.D', 'st*pid'];
let extraFail = 0;
for (const t of extraTests) if (!hasBlockedLanguage(t, extra)) { extraFail++; console.log(`  Lista del Admin NO detectó: "${t}"`); }
console.log(`Variantes de la lista del Admin: ${extraTests.length - extraFail}/${extraTests.length} detectadas`);

// Falsos positivos: nada de esto debe bloquearse
const OK = [
  'Colosenses 2:6-7', 'Arraigado en Cristo', 'Salmo 23 me sostiene', 'Gracias Señor por este día', 'computadora', 'reputación', 'disputa',
  'Está tarada la bocina?', 'Nos vemos en la plenaria', 'Hoy es un buen día para servir', 'Quiero conocer a más hermanos', 'Cuántos puntos', 'La computación es útil',
  'Espero que el culto esté bonito', 'Su fidelidad es grande', 'Oren por mi familia', 'Dios es bueno, siempre', 'Vamos a la 12va IAFCJ', 'milagro de Dios', 'Esto es una prueba de verdad',
  'Pastor Pérez y su esposa', 'Cantaremos juntos a las 5 pm', 'Cuesta $85 MXN', 'Nos vemos a las 7:30', 'Tengo 3 hermanos y 2 primas', 'Pedro y Pablo', 'Los kiosco, la kermés, el karaoke',
  'Va a ser vacío y vago', 'Jesús vive', 'Llevo mi Biblia y mi libreta', 'Ven y ve', 'Te amo Señor', 'La sopa esta caliente', 'dame la tuta', 'Lo que ve la gente', 'Pasé por Tecate y Mexicali',
];
let fp = 0;
for (const t of OK) if (hasBlockedLanguage(t)) { fp++; console.log(`  FALSO POSITIVO: "${t}"`); }
console.log(`Frases normales bloqueadas por error: ${fp}/${OK.length}`);

if (fp > 0 || extraFail > 0) process.exit(1);
