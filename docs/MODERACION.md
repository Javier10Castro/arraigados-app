# Moderación de Notas — filtro de lenguaje y lista administrable

> Actualizado: 5 oct 2026. Código: `shared/moderation.ts` (lista fija, la usan cliente y servidor),
> `server/blockedWords.ts` + migración `005_blocked_words.sql` (lista que administra el Admin) y
> `src/admin/Notas.tsx` (pantalla).

## Cómo funciona

Hay **dos listas** que se suman:

| Lista | Dónde vive | Quién la cambia | Cómo se aplica |
|---|---|---|---|
| **Fija** | `shared/moderation.ts` (más abajo) | Se edita el código y se hace deploy | Cliente (avisa mientras escribe) **y** servidor (la barrera real) |
| **Del Admin** | Tabla `BlockedWord` | Admin → **Notas → Palabras bloqueadas**, sin deploy | Solo servidor (al publicar) y en el carrusel (oculta de inmediato las notas ya publicadas) |

- Antes de comparar, el texto se **normaliza**: minúsculas, sin acentos, letras repetidas colapsadas
  (`puuuta`), leetspeak básico (`pu7a`, `$hit`), letras separadas (`p u t a`, `p.u.t.a`) y puntuación
  pegada (`culero!!`).
- Una **palabra suelta** coincide como **palabra completa**: bloquear `mil` no bloquea `milagro`.
  Algunas **raíces largas** de la lista fija (p. ej. `pendej`) bloquean todas sus variantes.
- Varias palabras = **frase** (`vete al cielo`), se busca aunque cambien los espacios o signos.
- Si el texto se bloquea, el servidor responde **422** `code: blocked_language` con un mensaje genérico;
  **nunca repite la palabra** que fue bloqueada.
- Quitar una palabra de la lista del Admin la deja de bloquear de inmediato (caché de ~30 s por
  servidor). Alta y baja quedan en **AuditLog** (`blocked_word.add` / `blocked_word.remove`).
- Si la migración 005 aún no está aplicada, el sistema **no se cae**: usa solo la lista fija.

### Qué NO hace (a propósito)
- No revisa significado ni contexto: es una lista, no inteligencia. Ante una nota ofensiva que no
  esté en ninguna lista, el Admin la **retira** (botón *Retirar* en Admin → Notas, con motivo).
- No bloquea palabras ambiguas de uso normal (se quitaron `tu madre`, `coger`, `coño`, `basura`,
  `tarada`, `retrasado`…). Si una palabra bloquea cosas legítimas, quítala de la lista del Admin o
  avisa para editarla en el código.

## Qué variantes detecta el filtro (actualizado 5 oct, noche)
Español e inglés, sobre la lista fija **y** sobre las palabras del Admin:

| Truco | Ejemplo | ¿Se detecta? |
|---|---|---|
| Mayúsculas / mezcla | `PuTa` | Sí |
| Números o símbolos por letras | `p3nd3j0`, `$hit`, `pu7a`, `f@g` | Sí |
| Letras repetidas | `puuuuta`, `fuuuck` | Sí |
| Letras separadas | `p u t a`, `p.u.t.a`, `p_u_t_a`, `p . u . t . a` | Sí |
| Palabra partida en trozos cortos | `pu ta`, `ver ga` | Sí |
| Carácter tachado | `p*ta`, `f*ck`, `*sshole`, `put#` | Sí (1 carácter cualquiera, o 2 vocales) |
| k por c, v por b, ph por f | `kabron`, `berga`, `phuck`, `fuk` | Sí |
| Letras de otro alfabeto que se ven iguales | `рuta` (р cirílica) | Sí |
| Caracteres invisibles / ancho completo | `p\u200buta`, `ｐｕｔａ` | Sí |
| Dentro de una frase con puntuación | `hola puta!!! amigo` | Sí |

**Probarlo:** `npm run moderacion:probar` (solo lee; genera ~2,100 variantes de cada palabra de la lista
fija y comprueba que se detecten, y que ~36 frases normales **no** se bloqueen). Para un texto suelto:
`npm run moderacion:probar -- "texto a probar"`. En la pantalla: Admin → Notas → **Probar un texto**
(usa el mismo filtro del servidor, con tus palabras incluidas).

## Pantalla (Admin → Notas → Palabras bloqueadas)
Abierta por defecto. Muestra **Agregadas por ti** (agregar, ✏️ editar para corregir un error de dedo, ✕ quitar),
**Probar un texto**, y la **lista de la app** (solo lectura, con buscador; para cambiarla se edita
`shared/moderation.ts`). Editar queda en Auditoría como `blocked_word.update`.

### Límites conocidos
Nada de esto es infalible: alguien puede inventar un truco nuevo (`pvt4` con una letra sustituida por otra
cualquiera). Si aparece una nota ofensiva, el Admin la **retira**; si se repite el patrón, se agrega la palabra.

## Retirar una nota (moderación)
Admin → Notas → botón **Retirar** en una nota *Activa* → escribir el **motivo** (obligatorio, ≤ 200
caracteres). La nota deja de verse en el carrusel al instante y queda **Vencida – retirada por Admin**
(no se borra). Se registra en AuditLog (`note.retire`: quién, cuándo, motivo, texto y asistente). El
asistente puede publicar otra nota.

## Lista fija actual (152 palabras, 12 raíces, 15 frases)

> ⚠️ Contiene lenguaje ofensivo — es la referencia de lo que ya se bloquea.

**Palabras completas:** puta, putas, puto, putos, putazo, putear, puteria, putamadre, putisima, verga, vergas, vergon, vergazo, chinga, chingas, chingo, chingar, chingada, chingado, chingadera, chingatumadre, chingon, pendejo, pendeja, pendejos, pendejas, pendejada, cabron, cabrona, cabrones, cabronazo, culero, culera, culeros, culo, culos, mierda, mierdas, mierdero, joder, jodete, jodido, jodida, carajo, pinche, pinches, marica, maricon, maricones, joto, jotos, puñal, punal, zorra, zorras, malparido, malparida, gonorrea, hijueputa, hijoeputa, hijodeputa, mamada, mamadas, tetas, nalgas, porno, pornografia, follar, estupido, estupida, idiota, imbecil, cagada, cagadas, cagon, cagona, ojete, ojetes, verguiza, vergota, cojones, cojudo, cojuda, chinguen, chingue, chingues, chingamos, putita, putito, putillas, putaza, putero, culiado, culiao, culiar, lameculos, pajero, pajera, huevon, huevona, mongolo, sidoso, bastardo, bastarda, pendejete, cabroncito, cabroncita, hdtm, hdlgp, vtlv, ptmr, chtm, hdp, hdpm, ptm, ctm, csm, vrg, wtf, stfu, fuck, fucker, fucking, fuckin, motherfucker, shit, shitty, bullshit, bitch, bitches, asshole, dick, dickhead, cunt, whore, slut, bastard, nigger, nigga, fag, faggot, retard, pussy, cocksucker, dumbass, jackass, wanker, twat, piss, pissed, dammit, goddamn

**Raíces (bloquean cualquier palabra que empiece así):** pendej, chingad, chingon, mierd, cabron, putaz, putamadre, maricon, fuck, motherf, hijueput, malpari

**Frases:** hijo de puta, hija de puta, hijos de puta, tu puta madre, vete a la verga, vales verga, vale verga, chupame, mamame, a la chingada, a la mierda, me vale madres, valgo madres, vales madres, ni madres

## Qué agregar desde el panel (sugerencias)
Palabras propias de la región, apodos ofensivos entre jóvenes, nombres de marcas/partidos si no se
quieren ver en las notas, y cualquier cosa que aparezca en *Retirar*. Si una misma palabra se agrega
varias veces al panel, es señal de que conviene pasarla a la lista fija.
