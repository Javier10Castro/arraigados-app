# Cambios de interfaz (ajustes pequeños)

Registro de ajustes visuales hechos fuera de las etapas del plan, para tener el
contexto de por qué una pantalla se ve como se ve y cómo revertirlo.

---

## 2026-10-01 · Sidebar del panel de Admin: marca en tres renglones

**Dónde:** `src/admin/AdminShell.tsx` y `src/admin/AdminShell.module.css`.
Es el menú lateral de todas las pantallas del panel (`/admin/*`), solo en
computadora (≥ 1024 px). En celular se usa la barra inferior y no cambió.

**Antes:** el wordmark ARRAIGADOS arriba y, debajo, el logo de círculos de la
RJDT (50 px) en la misma fila que el texto "Panel Admin".

**Ahora:** tres renglones centrados, cada uno con su propio espacio:

```
ARRAIGADOS            (wordmark, sin cambios)
[círculos RJDT]       (≈ 62 % del ancho del menú, máx. 150 px)
ADMIN                 (texto, letras espaciadas)
```

- Se quitó el contenedor `.brandMeta` (fila logo + texto).
- `.brand` ahora es una columna centrada; `.brandRings` define el tamaño del
  logo; `.brandLabel` es el texto "ADMIN".
- El texto pequeño "PANEL ADMIN" que aparece arriba del título de cada pantalla
  (`.kicker`) **no** se cambió.

**Para ajustar el tamaño del logo:** `.brandRings { width: …; max-width: …; }`.

---

## 2026-10-01 · Staff: se oculta el botón "Código AR26"

**Dónde:** `src/pages/Staff.tsx` y `src/pages/Staff.module.css`.

**Qué era:** junto a "Buscar" había un segundo botón, "Código AR26" (ícono de
llave), que abría un campo para escribir a mano el código de respaldo de la
pulsera (`AR26-XXXXX`) y abrir el modal de canje.

**Decisión:** por ahora no se usará, pero puede servir más adelante, así que
**el código se conservó completo** y solo se ocultó con una constante:

```ts
// src/pages/Staff.tsx
const SHOW_MANUAL_CODE = false;
```

Con `false` no se muestran ni el botón ni el formulario. Para volver a usarlo,
cambiar a `true`; no hay que tocar nada más.

**Qué sigue funcionando:**
- Escanear el QR de la pulsera.
- **Buscar** por nombre y/o iglesia: cada resultado muestra el código
  AR26-XXXXX y abre el mismo modal de canje. Es la alternativa cuando un QR no
  se puede leer.
- El backend no cambió: `/api/staff/pulse?code=…` sigue aceptando el código
  manual (lo usa también "Buscar").

**Estilo:** `.tools` pasó de dos columnas fijas a "una columna por botón"
(`grid-auto-flow: column; grid-auto-columns: 1fr`), para que "Buscar" ocupe todo
el ancho mientras sea el único botón y vuelvan a ser dos mitades si se reactiva
el código manual.

**Nota:** el enlace "Cambiar mi contraseña" de la pantalla de Staff (sin
ícono) se mantiene.

---

## 2026-10-01 · Landing (portada): cita bíblica sin brillo

**Dónde:** `src/pages/Cover.tsx` y `src/pages/Cover.module.css` (ruta `/`).

**Antes:** la cita (imagen `Cita_Morado.svg`, Colosenses 2:6-7 completo) tenía
un brillo/sombra crema alrededor de las letras (`filter: drop-shadow(...)`) que
la hacía ver borrosa y difícil de leer.

**Ahora:** la misma imagen `Cita_Morado.svg`, con el versículo completo, **sin
brillo ni sombra**.

- Se compararon las dos versiones (`Cita_Morado.svg` y `Cita_Beige.svg`) sobre
  el fondo real en celular y computadora: casi todo el texto queda sobre la
  zona clara del fondo, donde la morada contrasta mucho mejor; la beige casi
  desaparece.
- Se probó también convertirla a texto en un recuadro y acortar el versículo;
  se descartó: el versículo debe ir completo y sin sombra.
- El texto alternativo (`alt`) de la imagen ahora tiene el pasaje completo.

**Para cambiar a la beige:** en `Cover.tsx` cambiar `Cita_Morado.svg` por
`Cita_Beige.svg`.

---

## 2026-10-01 · Landing (portada, celular): se quita "OCTUBRE" morado y la fecha pasa a la derecha

**Dónde:** `src/pages/Cover.tsx` y `src/pages/Cover.module.css` (ruta `/`, solo en
pantallas de menos de 760 px; en computadora estos elementos están ocultos).

**Antes:** arriba a la izquierda iba el bloque de fecha (17 Y 18 · Octubre ·
Congreso Distrital 2026) y arriba a la derecha la palabra "OCTUBRE" grande en
morado.

**Ahora:**
- Se eliminó el "OCTUBRE" morado (el `<span className={styles.month}>` y sus
  estilos `.month`).
- El bloque de fecha ocupa su lugar, en la esquina superior **derecha**,
  alineado a la derecha. La esquina izquierda queda libre.
- En celulares de hasta 420 px se redujeron un poco el logo RJDT (centrado) y
  el texto de la fecha para que no se toquen: quedan ~19 px de separación en
  320 px y ~27 px en 390 px (antes de ajustar se encimaban en 320 px).

**Para revertir:** volver a poner `left: 0; align-items: flex-start;` en
`.dateBlock` (en lugar de `right: 0; align-items: flex-end; text-align: right`).

---

## 2026-10-01 · Landing (portada, celular): "Congreso Distrital 2026" a la izquierda y nuevas fuentes

**Dónde:** `src/pages/Cover.tsx` y `src/pages/Cover.module.css` (solo celular, < 760 px).

**Ahora la cabecera queda así:**

```
CONGRESO            [RJDT]            17 Y 18
DISTRITAL 2026                        OCTUBRE
```

- **"Congreso Distrital 2026"** salió del bloque de la fecha y va solo en la
  esquina superior **izquierda** (`.districtBlock`), con la fuente
  `public/rcs/fonts/fonnts.com-Antarctican_Headline_Ultrabold.otf` (declarada
  como familia `"Antarctican Ultrabold"` en el CSS de la portada).
- **La fecha** ("17 y 18" + "Octubre") queda a la **derecha** con la fuente
  **Pressio** (`PressioTEST-No.35.otf`, la `@font-face` que ya estaba en el CSS).
  Como Pressio es muy angosta, "Octubre" se subió al ~85 % del tamaño de
  "17 y 18" para que ocupe casi el mismo ancho.
- Separación mínima con el logo RJDT: 41 px a la izquierda y 68 px a la
  derecha en un celular de 320 px.

**Corrección:** en el cambio anterior (quitar el "OCTUBRE" morado) se rompió
sin querer la regla que oculta la fecha en computadora, así que la fecha de la
cabecera aparecía también en pantallas grandes. Ya se restauró: en computadora
`.dateBlock` y `.districtBlock` están ocultos.

⚠️ **Pressio (versión TEST) no tiene acentos ni ñ** (solo 66 caracteres). Para
"17 y 18 Octubre" no importa, pero no se debe usar para textos con á, é, í, ó,
ú o ñ: esas letras saldrían en otra fuente.

---

## 2026-10-01 · Lotes: página propia, tabla, "Kit" y descargas

**Dónde:** `src/admin/Lotes.tsx`, `src/admin/LoteDetalle.tsx` (nuevo) + `.module.css`,
`src/admin/format.ts` (nuevo), `src/App.tsx`, `src/admin/nav.ts`, `src/lib/api.ts`,
`src/styles/global.css`, `src/admin/AdminModal.module.css` y textos en
`Conocer`, `Inicio`, `Registro`, `Beneficios`, `RedeemModal`.

- **Ver un lote** ya no abre un modal: lleva a `/admin/lotes/:id`, una página con el
  mismo estilo (tarjetas crema). Botón "‹ Lotes" para regresar. Al crear un lote se
  abre directamente su página.
- **Tabla de pulseras:** `# | Kit | Estado | Código | Copiar | Descargar`. Estados:
  Sin reclamar / Reclamado / Invalidado. En celulares angostos (< 560 px) la columna
  Código se oculta para que quepa. 50 pulseras por página.
- Se quitó la leyenda "El enlace copiado y el QR descargado apuntan a…".
- **Fechas cortas:** `1 oct, 23:00` (sin año, 24 h).
- **"Paquete" → "Kit"** en los textos: Crear lote, menú del panel ("Kits"), Conocer,
  Inicio, Registro, "Mi kit", modal de Staff.
- **Barra de desplazamiento:** delgada, crema sobre el morado (y morada dentro de los
  modales crema), en lugar de la gris del sistema.
- **Descargas:** el QR baja como `.png` y el lote como `.pdf`. Antes, si el servidor
  respondía con error, el navegador guardaba ese error como `.json`; ahora se muestra
  el mensaje y no se descarga nada.
- **Enlace de desarrollo:** sin `PUBLIC_BASE_URL`, el enlace es
  `http://localhost:8888/p/…` (antes fallaba y por eso las descargas salían en `.json`).


---

## 2026-10-01 · Lote: descarga con plantilla, tabla más visual y columna Usuario

**Dónde:** `server/wristband.ts` (`qrCardPng`), `server/pngjs.d.ts` (nuevo),
`netlify/functions/admin-batch.mts`, `src/admin/LoteDetalle.tsx` + `.module.css`,
`package.json` (`pngjs` declarado; ya venía instalado con `qrcode`).

- **Descargar (por pulsera)** ahora baja la **tarjeta completa**: la plantilla
  oficial con el QR en su recuadro, como en el PDF. PNG de 591 × 413 px
  (= 50 × 35 mm a 300 ppp), nombre `pulsera-<código>.png`. El QR se dibuja con
  píxeles enteros (nítido) y se verificó que se escanea.
- **Estados con indicador visual:** cada estado es una píldora con ícono y color
  (◌ Sin reclamar gris · ✓ Reclamado verde · ⊗ Invalidado rojo).
- **Columna Usuario:** iniciales en círculo + nombre del asistente que reclamó la
  pulsera; si no tiene, "Sin asignar" en gris.
- **Kit** como etiqueta pequeña; filas alternadas; barra de avance "% reclamadas"
  en la tarjeta de datos del lote.
- Celular angosto (< 480 px): se ocultan Kit (es el mismo para todo el lote y ya
  aparece arriba) y el círculo de iniciales, para que el nombre no se parta.
- `PUBLIC_BASE_URL=localhost:8888` (sin `http://`) se acepta y se completa a
  `http://localhost:8888`.

---

## 2026-10-01 · Logo + texto con espacio, sidebars iguales, Conocer, Registro y títulos en Pressio

- **Logo + texto (Login "Staff", Registro, Conocer, Cambiar contraseña):** el
  espacio entre el logo ARRAIGADOS y la palabra de abajo pasó de 6 px a 14 px
  para que no se encimen (`.brand` en `Login`, `Registro` y `Conocer.module.css`;
  Cambiar contraseña usa los estilos de Login).
- **Sidebar del asistente** (`AppShell`) con la misma estructura que el de Admin:
  ARRAIGADOS / círculos RJDT grandes / "CONGRESO 2K26".
- **Registro:** se quitaron los campos Presbiterio y Zona (se calculan en el
  servidor a partir de la iglesia; el asistente no tiene que verlos).
- **Conocer:**
  - La cita es la imagen oficial `Cita_Beige.svg` (antes era texto escrito).
    Beige porque el fondo de Conocer es oscuro.
  - Fecha: "17 y 18 de octubre" · "Sábado y Domingo" (sin año).
  - Se quitó el bloque "Red Juvenil Tijuana".
  - "CONGRESO 2K26" bajo el logo en **Pressio** y más grande (22 px), con más espacio.
  - Paso 2 de "Cómo funciona": ya no menciona "el código impreso en la pulsera"
    (desde la Etapa 3 no hay código manual): "Si no se puede escanear, pide ayuda al Staff."
- **Títulos del panel de Admin** (Lotes, Usuarios, un lote…): Pressio 35, grande
  (44–64 px). Se quitó "PANEL ADMIN" de encima del título en todas las pantallas
  del panel (vive en `AdminShell`, así que aplica a todas).
- Pressio ahora se declara en `src/styles/tokens.css` (`--font-pressio`).
  ⚠️ No trae acentos ni ñ: en un título como "Más" la "Á" sale en la fuente de
  respaldo.

---

## 2026-10-01 · Admin "Más" (celular) sin título

`src/admin/AdminShell.tsx`: el título ahora es opcional y la pantalla "Más" del
celular ya no lo muestra (era redundante con la pestaña "Más" de la barra inferior,
y además Pressio no tiene la "Á").

---

## 2026-10-02 · Staff: reemplazar pulsera · "Invalidado" pasa a "Deshabilitado"

- **Modal de Staff** (`RedeemModal.tsx`): enlace "Reemplazar pulsera (perdida o dañada)" debajo de los
  botones. Pasos: escanear la pulsera nueva → confirmar (actual → nueva, aguas) → listo. Mientras se
  escanea la nueva, la cámara de la pantalla de Staff se apaga (`Staff.tsx`, `onCameraNeeded`).
- Si la pulsera escaneada no sirve (ya tiene dueño, otro kit, deshabilitada, no existe), lo dice y
  sigue escaneando.
- El estado `INVALIDATED` se muestra como **Deshabilitado / deshabilitada** (tabla del lote, conteos y
  modal de Staff). En la tabla, una pulsera reemplazada muestra "Nombre · reemplazada" tachado.


---

## 2026-10-02 · No se descarga una pulsera deshabilitada

- En la tabla del lote, el botón **Descargar** de una pulsera **Deshabilitada** queda
  bloqueado (tenue, borde punteado, cursor de prohibido y aviso al pasar el mouse).
- También en el servidor: `GET /api/admin/batches/:id/pulses/:pulseId/qr` responde 409
  "Esta pulsera está deshabilitada…" en vez del PNG (`admin-batch.mts`,
  `pulseTokenInBatch` ahora devuelve también el estado).
- Copiar el enlace sigue disponible (al abrirlo, la app dice que la pulsera ya no es válida).


---

## 2026-10-02 · Etapa 4: pantallas de Asistentes

- Nuevas `/admin/asistentes` y `/admin/asistentes/:id` (detalle en el handoff §33). Mismo
  lenguaje visual que Lotes: tarjetas crema, chips de kit, tabla con filas que llevan al detalle.
- Aguas en la tabla: vasitos llenos = disponibles, más `2/3`; en rojo cuando están agotadas;
  "No incluye" si su kit no trae.
- En el detalle el título es "Asistente" y el nombre va dentro de la tarjeta (Pressio no tiene
  acentos). En celular el botón **Corregir** baja debajo del nombre para no salirse de la tarjeta.
