// npm run plantilla:base64
//
// Convierte la plantilla oficial de la pulsera en un módulo TypeScript con el
// PNG en base64, para que el PDF se pueda generar dentro de una Netlify
// Function SIN leer archivos del disco.
//
// Por qué no `fs.readFileSync`: Netlify empaqueta cada función en un solo
// archivo JS y solo sube los archivos que están listados explícitamente
// (includedFiles). Un `readFile` a una ruta del repositorio funciona en
// `netlify dev` y falla en producción. Incrustar el PNG en el bundle elimina
// esa diferencia entre desarrollo y producción.
//
// La plantilla es la fuente de verdad: src/assets/plantillas/template_card_clean.png
// (copia idéntica de Arraigados\qr_template\template_card_clean.png, 195 988 B,
// SHA256 542c44d9cb7817953a604ad143f4513e7e6d96a713aa4bc9b2047b54d68f421a).
//
// Uso: node scripts/gen-plantilla-base64.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pngPath = path.join(root, 'src', 'assets', 'plantillas', 'template_card_clean.png');
const outPath = path.join(root, 'server', 'plantilla.generated.ts');

const bytes = readFileSync(pngPath);
const b64 = bytes.toString('base64');

// Dimensiones reales leídas de la cabecera IHDR del PNG (bytes 16-23, big endian).
const width = bytes.readUInt32BE(16);
const height = bytes.readUInt32BE(20);

const chunk = 120;
const lines = [];
for (let i = 0; i < b64.length; i += chunk) lines.push(`  '${b64.slice(i, i + chunk)}'`);

const out = `/* eslint-disable */
// GENERADO POR \`npm run plantilla:base64\` -- NO EDITAR A MANO.
//
// Plantilla oficial de la pulsera (qr_template/template_card_clean.png del
// proyecto Next.js), incrustada como base64 para que la Netlify Function
// pueda generar el PDF sin leer archivos del disco (ver el script).
// Para cambiarla: reemplaza src/assets/plantillas/template_card_clean.png
// y vuelve a correr el script.

const BASE64 =
${lines.join(' +\n')};

/** Bytes del PNG, decodificados en memoria. */
export const PLANTILLA_CARD_PNG = Uint8Array.from(atob(BASE64), (c) => c.charCodeAt(0));

/** Medidas reales de la plantilla en píxeles (leídas del IHDR del PNG). */
export const PLANTILLA_W = ${width};
export const PLANTILLA_H = ${height};
`;

writeFileSync(outPath, out, 'utf8');
console.log(`OK  ${path.relative(root, outPath)}`);
console.log(`    PNG ${bytes.length} B · ${width}x${height} px · base64 ${b64.length} chars`);
