# Manual de Rifas — Arraigados 2K26 (16–17 oct 2026)

Guía para el administrador que operará las rifas durante el evento. Complementa a [`MANUAL_USUARIO.md`](MANUAL_USUARIO.md); el detalle técnico está en [`API.md`](API.md) y [`PLAN_HABILITACION_NEON.md`](PLAN_HABILITACION_NEON.md).

> **Estado de verificación (honesto).** Las pruebas automáticas de rifas (sorteo, concurrencia, cancelación, privacidad, migraciones) pasaron en una base PostgreSQL local desechable. **Nunca se han ejecutado contra la base real (Neon) ni se ha hecho un sorteo real.** Antes del evento haz el ensayo de la sección 12.

> **Novedad 27 oct 2026 (migración 017).** Ahora **solo participan quienes entran a la rifa** desde la app: en **Rifa** (`/rifa`, también en Home y en Más) el asistente ve el premio de su kit, presiona **Entrar a rifa** y responde 3 preguntas (¿Qué fue lo que más te gustó? · ¿Cuál fue tu plenaria favorita? · ¿Qué enseñanza te dejó el congreso?). Ver la sección 13.

## 1. Requisitos previos
Las rifas dependen de dos migraciones que **deben estar aplicadas en la base real**:

| Migración | Habilita | Si falta |
|---|---|---|
| `014_raffles` | Crear rifas, sortear, historial, vista pública | La pantalla avisa «Las rifas aún no están habilitadas en esta base (falta aplicar la migración 014).» Las acciones responden 409, no se rompe nada. |
| `016_raffle_cancel` | Botón **Cancelar rifa** | Al cancelar aparece un error 409 que indica que falta la migración 016. Todo lo demás funciona. |

Además: los asistentes deben tener **pulsera activa** de su kit (solo ellos participan) y tu cuenta debe estar autorizada (sección 2). Aplicar migraciones lo hace el responsable técnico con respaldo verificado; **no se hace desde la app**.

## 2. Acceso y quién puede administrar
- Menú de Admin → **Rifas** (`/admin/rifas`). La entrada del menú **solo aparece** en cuentas autorizadas.
- Pueden administrar únicamente `javiercastro9912@gmail.com` y `perlarivera@redjuveniltijuana.com` (la misma lista que los descuentos del equipo). Cualquier otro Admin, Staff o asistente recibe «prohibido» (403) aunque conozca la dirección. El servidor lo decide con la sesión.

## 3. Crear una rifa
En **Abrir rifa**:
1. **Kit**: elige el kit. Solo participan asistentes con pulsera activa de ese kit.
2. **Ganadores a sortear**: de 1 a 500.
3. **Nombre (opcional)**: si lo dejas vacío se pone «Rifa <Kit> · Edición N».
4. Presiona **Abrir rifa**.

Reglas: solo puede haber **una rifa abierta por kit**; si ya hay una, el servidor lo indica (409). Una edición nueva es una rifa nueva (la numeración sube sola). Mientras la rifa está **Abierta** puedes cambiar **Ganadores a sortear** y presionar **Guardar** (debe ser **mayor** que los ganadores ya sorteados).

## 4. Estados
| Estado | Significado | Puedes… |
|---|---|---|
| **Abierta** | Faltan ganadores | Sortear, cambiar el objetivo, cancelar |
| **Completada** | Se alcanzó el objetivo | Sorteo extra |
| **Cancelada** | Se cerró sin completarse | Solo consultar (no sortear, editar ni reabrir) |

## 5. Sorteo normal
1. En la tarjeta de la rifa presiona **Sortear ganador**.
2. Aparece la confirmación: «¿Sortear un ganador de «<nombre>»? El resultado es irreversible…». Confirma con **Sí, sortear** (o **Cancelar** para volver).
3. El servidor elige al azar (aleatoriedad criptográfica) entre los elegibles que aún no ganaron en esa rifa, guarda el resultado y lo muestra: «Ganador confirmado por el servidor (#N): …».
Un asistente **no puede ganar dos veces** en la misma rifa. Si se repite la petición por un corte de red, el resultado ya guardado se devuelve («ya estaba registrado») y **no** se sortea otro. Si no quedan elegibles el botón se bloquea («No hay participantes elegibles»).

## 6. Sorteo extra
Solo cuando la rifa está **Completada**: **Sorteo extra…** → confirmar con **Sí, sortear extra**. El ganador queda marcado «extra». No está disponible en rifas abiertas ni canceladas.

## 7. Cancelar una rifa
Solo rifas **Abiertas**. **Cancelar rifa** → **Sí, cancelar rifa** (o **No, volver**). Es **irreversible**: no se puede reabrir, editar ni sortear. **No borra nada**: los ganadores ya sorteados y el historial se conservan. Después puedes abrir una rifa nueva para ese kit. Requiere la migración 016.

## 8. Vista pública (proyector)
En la tarjeta: **Abrir vista pública (proyector) ↗** abre `/rifa/<id>` en otra pestaña. Es de solo lectura y no tiene controles: muestra la ruleta, **Ganadores** y **Participantes restantes**, y anima cada ganador nuevo (con confetti, salvo que el equipo tenga activado «reducir movimiento»). Se actualiza sola cada ~2.5 s. Recargar **no repite ni sortea nada**; lo ya guardado se muestra sin animación.
Mensajes: «Esperando el primer sorteo», «Rifa completada», «Rifa cancelada», «No hay más participantes elegibles», «Sin conexión. Reintentando…», «Esta rifa no existe.»
Tip: abre la vista pública en el proyector y opera el panel desde tu equipo.

## 9. Qué se ve y qué no
- **Público (proyector):** nombre del kit, nombre de la rifa, conteos y ganadores como **«Nombre I.»** (nombre + inicial del apellido; se ignoran partículas como «de», «del», «la»). Nada más.
- **Solo Admin autorizado:** nombre completo del ganador, fecha y hora, quién sorteó, número de participantes elegibles, historial.
- Nunca se publican correos, teléfonos, códigos de pulsera ni identificadores de asistentes.

## 10. Errores y qué hacer
| Qué ves | Qué hacer |
|---|---|
| Falta la migración 014 / 016 | Avisa al responsable técnico; no insistas. No se perdió nada. |
| Error de red al sortear | **No** presiones varias veces. Espera, recarga el panel y revisa **Ver historial**: si el ganador está, ya se registró; si no, repite una vez. |
| Sesión caducada / prohibido | Inicia sesión con una cuenta autorizada (sección 2). |
| Mensaje de «demasiadas solicitudes» (límite de seguridad) | Espera un minuto y reintenta una vez. |
| Resultado inesperado | No manipules la base. Anota rifa, hora y ganador, revisa el historial y avisa al responsable técnico. |
| El proyector dice «Sin conexión» | Revisa internet; se reintenta solo. |

## 11. Comprobar ganadores sin tocar la base
- Panel: **Ver historial** muestra #, ganador, fecha y hora y quién sorteó (con la marca «extra»).
- Proyector: la lista pública de ganadores debe coincidir con el historial (en forma abreviada).
- El conteo «Ganadores X / objetivo» debe coincidir con las filas del historial.

## 12. Lista de comprobación antes del evento
- [ ] Migraciones 014 y 016 verificadas en la base real (consultas de solo lectura en `PLAN_HABILITACION_NEON.md`), con respaldo verificado antes de aplicarlas.
- [ ] Mi cuenta es una de las dos autorizadas y veo «Rifas» en el menú.
- [ ] Hay asistentes con pulsera activa en cada kit a rifar (el conteo «Participantes elegibles» es el esperado).
- [ ] Ensayo en un entorno de prueba (no en producción): crear, sortear, sorteo extra, cancelar y abrir la vista pública en el proyector.
- [ ] Proyector probado a la resolución real y con internet estable.
- [ ] Se acordó quién opera el panel y que **un sorteo no se puede deshacer**.
- [ ] El responsable técnico está localizable durante el evento.

## 13. Inscripción con preguntas, «gana la salida #N» y premios (migración 017)

**Premios** (`shared/raffle.ts`, imágenes en `src/assets/premios/`): Especial → Amazon Echo Pop · Kit B → Owala FreeSip · Kit A → Tarjeta de regalo Amazon $300. «Inscripción Domingo» no tiene rifa. Pantalla pública para proyectar: **`/premios`**.

**Asistente.** En `/rifa` presiona **Entrar a rifa**, responde las 3 preguntas (una por pantalla; la plenaria se elige entre las del programa oficial) y queda inscrito en la rifa de **su** kit. Solo una vez; no puede cambiar sus respuestas. Después del sorteo, en esa misma pantalla ve quién ganó (nombre + inicial) o «¡Ganaste!».

**Admin → Rifas → Inscritos.** Pestaña por kit con cuántos entraron, nombre, iglesia, plenaria, lo que más le gustó, la enseñanza y la fecha. Buscador y **Descargar CSV** (todas las respuestas, para Excel). «Pulsera inactiva» = ya no entra al sorteo. **Cerrar inscripciones** antes de empezar a sortear para que nadie entre a medio sorteo (se puede volver a abrir).

**Abrir rifa → «Gana la salida #».** Ej.: 3 = cada **Sorteo** saca a una persona; la 1.ª y la 2.ª **no ganan**, la 3.ª **gana** y la rifa queda completada. En el proyector las salidas que no ganan se anuncian «Salida #1 · No gana…» y la ganadora «¡Tenemos ganador!» con el premio. Si el ganador no está presente, usa **Sorteo extra** (también cuenta como ganador). Mientras la rifa está abierta puedes cambiar la salida ganadora (siempre mayor a las que ya salieron).

**Orden sugerido el día del sorteo:** 1) Cerrar inscripciones. 2) Proyectar `/premios`. 3) Abrir la rifa de cada kit con su salida ganadora. 4) Abrir el proyector de esa rifa (`/rifa/:id`). 5) Presionar **Sorteo** las veces necesarias.

**Aplicar en producción** (con respaldo): `npm run db:migrar -- --only 017_raffle_entries.sql` (requiere 014). Verificar con `npm run db:estado`. Reversión: `docs/rollback/017_raffle_entries_down.sql` (aborta si ya hay inscripciones). Sin la 017 la app dice «La rifa estará disponible muy pronto» y Admin avisa «falta la migración 017» (nunca error 500).

## 14. Quitar a alguien de la rifa (migración 018)

En **Admin → Rifas → Inscritos**, cada fila tiene **Quitar**. Al confirmar, esa persona **no entra al sorteo** y **no puede volver a inscribirse**; en su celular ve «No estás participando». Sus respuestas **no se borran** (siguen en el CSV con «No (quitado por …)»). Si fue un error, **Restaurar** la regresa. Lo que ya se sorteó no cambia: si alguien ya había salido, su salida se queda en el historial.

Aplicar en producción (antes de publicar el código): `npm run db:migrar -- --only 018_raffle_entry_remove.sql`. Sin la 018 la app avisa «falta la migración 018» (nunca error 500). Reversión: `docs/rollback/018_raffle_entry_remove_down.sql` (aborta si hay personas quitadas).

## 15. Proyector con nombres pasando (28 oct 2026)

La ruleta del proyector (`/rifa/:id`) se cambió por un **carrete de nombres**:
- **En espera**, los nombres de quienes siguen participando pasan despacio.
- Al presionar **Sorteo** en el Admin, los nombres pasan rápido, se frenan y se detienen en la persona que salió. Esa persona ya la eligió y guardó el servidor; la animación solo la muestra.
- **Si esa salida no gana**, se marca en el carrete: «Salida #1 · No gana… ¡Gana la salida #3! Faltan 2.».
- **La ganadora** se ilumina y luego sale la pantalla de «¡Tenemos ganador!» con el premio.

Privacidad: el proyector recibe los nombres de quienes siguen participando, siempre como **nombre + inicial del apellido** («Ana A.»), máximo 300. Nunca apellidos completos, iglesias, ids ni datos de contacto.
