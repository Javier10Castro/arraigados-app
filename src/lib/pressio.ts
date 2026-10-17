/**
 * Pressio (la fuente de los títulos grandes, ver tokens.css) NO trae tildes: esas letras salen en una fuente de
 * respaldo y el título se ve desparejo. Esta función quita las tildes y diéresis SOLO del texto que se pinta con
 * Pressio ("Información" -> "Informacion", "Más" -> "Mas", "Administración" -> "Administracion").
 *
 * Reglas:
 *  · Se usa únicamente en los títulos que usan Pressio (hoy: el título de cada pantalla del panel, AdminShell, y el
 *    aviso «Todavia no hay datos» del Dashboard). NO es una transformación global: párrafos, botones, nombres de
 *    personas, datos de la base, rutas y títulos en otras fuentes conservan sus acentos.
 *  · La «ñ» se conserva (cambiarla a «n» cambia la palabra: «año» ≠ «ano»); el comentario de tokens.css ya
 *    documenta que Pressio tampoco la trae, así que sale en la fuente de respaldo, igual que antes.
 *  · Solo cambia lo que se muestra; nunca el valor guardado ni la ruta.
 */
export function pressioText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/([nN]̃)|[̀-ͯ]/g, (_m, keepN?: string) => keepN ?? '')
    .normalize('NFC');
}
