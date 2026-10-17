# Plan de habilitación en Neon (producción) y pruebas aisladas

> **Estado: SOLO PLAN. Nada de esto se ha ejecutado contra Neon.** `localhost` usa la base de producción (por `.env`):
> cualquier comando de este documento contra esa conexión requiere autorización explícita de Javier, paso por paso.
> Este documento no contiene (ni debe contener) contraseñas, URLs de conexión, tokens ni llaves.

## 1. Qué escribe y qué no (clasificación de comandos)

| Comando | ¿Escribe en la base configurada? | Uso seguro |
|---|---|---|
| `npm run db:esquema`, `db:conteo`, `db:respaldo-total` (solo lee y guarda archivos en `respaldos/`) | No (lectura) | Permitido solo con autorización; consultas mínimas |
| `npm run db:migrar` (sin `--only`) | **Sí, DDL de TODAS las migraciones** (incluye la 011, que no debe aplicarse todavía) | **Nunca así** |
| `npm run db:migrar -- --only <archivo>` | **Sí** (solo ese archivo) | Solo en el paso de §4, con autorización |
| `db:limpiar-pruebas`, `db:restaurar*`, `db:renombrar-kits`, `db:notas-demo`, `db:likes-demo`, `manual-local-seed`, `moderacion-prueba` | **Sí** | Solo en base desechable |
| `npm run test:team`, `npm run test:ratelimit` | **Sí (vacían y recrean tablas)** | Solo en base local `arraigados_test*`; los scripts se niegan si no es `localhost` o no se llama `arraigados_test*` |
| `netlify dev` / `npm run dev` | Sí (login, canjes, notas, sorteos reales) | Contra Neon = producción; evitar para probar escrituras |

## 2. Pruebas que necesitan escrituras: base aislada y desechable

Nunca con la conexión de `.env`. Opción A (recomendada, 100 % local):

```bash
# PostgreSQL 16 local (Docker o instalación nativa), usuario/clave de PRUEBA, nada de Neon
docker run -d --name arraigados-pg -e POSTGRES_PASSWORD=localtest -p 5432:5432 postgres:16
docker exec arraigados-pg createdb -U postgres arraigados_test_suite
export TEST_DATABASE_URL=postgres://postgres:localtest@localhost:5432/arraigados_test_suite   # solo en esa terminal
npm run test:team          # aplica el esquema completo (incl. 012–015) sobre la base de prueba
npm run test:ratelimit
```

Opción B: una **rama de Neon** descartable. Crearla y conectarla requiere autorización (toca la configuración de Neon) y su URL
**no** debe ir a `.env` de producción ni a los archivos del repo. Los scripts de prueba rechazan hosts que no sean `localhost`,
así que la rama solo serviría para pruebas manuales con `netlify dev` en una copia de `.env` fuera del repo.

Lo que **no se pudo probar sin escrituras** hasta tener base aislada en tu equipo: `test:team` (171 pruebas), sorteos, autocanje,
descuentos, notas del equipo. En el entorno de desarrollo del asistente se ejecutaron en un PostgreSQL 16 local desechable (171/171).

## 3. Respaldo ANTES de tocar producción (no se afirma que exista hasta comprobarlo)

1. **Rama de Neon** del estado actual (UI de Neon): respaldo instantáneo y restaurable. Anotar nombre y hora.
2. `npm run db:respaldo-total` (lee todas las tablas dinámicamente; guarda en `respaldos/total-…`, que está en `.gitignore`; contiene datos personales). Copiar la carpeta a un lugar privado externo.
3. **Probar la restauración**: crear una base desechable (§2) y ejecutar `npm run db:restaurar-total -- respaldos/total-…` **apuntando a esa base** (con `TEST_DATABASE_URL`/`DATABASE_URL` de la terminal, jamás a producción). Comparar conteos con `db:conteo`.
4. Hasta que el paso 3 salga bien, el respaldo se considera **no verificado**. Las migraciones 012–015 son idempotentes y aditivas, y cada una tiene rollback en `docs/rollback/`, pero un rollback no sustituye un respaldo.
5. Nota: el respaldo se toma ANTES de migrar, así que no contiene las tablas nuevas (no hacen falta); restaurarlo sobre una base ya migrada no es el procedimiento de reversa: para eso están los `*_down.sql`.

## 4. Orden de aplicación (NO ejecutar sin autorización)

Estado actual en Neon: **012, 013, 014 y 015 sin aplicar** (la 011 tampoco; es de otro tema y NO entra en este plan).

Antes: confirmar con `npm run db:esquema` (solo lectura) qué existe. Después, **una por una** y comprobando entre cada una:

```bash
npm run db:migrar -- --only 012_staff_selfredeem.sql   # Redemption.attendeeId nullable + beneficiaryUserId, StaffPulse, triggers, SelfRedeemSetting/Override
npm run db:migrar -- --only 013_team_discount.sql      # TeamDiscountSetting (depende solo de "User")
npm run db:migrar -- --only 014_raffles.sql            # Raffle, RaffleWinner (append-only)
npm run db:migrar -- --only 015_team_notes.sql         # Note/NoteLike con autor de equipo (attendeeId nullable + userId)
npm run db:migrar -- --only 016_raffle_cancel.sql      # Raffle: estado CANCELLED + cancelledAt/cancelledById (depende de 014; rollback en docs/rollback/016_raffle_cancel_down.sql)
```

Dependencias: 013 y 014 son independientes entre sí y de la 012. La **015** y el canje/pulsera del equipo (012) son lo que habilita
la vista de visitante del equipo; sin 012 las rutas del equipo fallan, sin 015 el equipo puede leer notas pero no publicar ni dar like
(el código lo detecta y los asistentes siguen funcionando igual). Sin 013/014 las pantallas de Descuentos/Rifas muestran «no disponible».

Verificación posterior (solo lectura): `db:esquema` muestra las tablas/columnas nuevas; `db:conteo` mantiene los conteos previos de
asistentes, pulseras, usuarios, paquetes, pagos, bebidas y canjes.

Reversa: `docs/rollback/0NN_*_down.sql` en orden inverso (015 → 014 → 013 → 012), cada uno revisado antes (algunos descartan datos de las tablas nuevas).

## 5. Despliegue

- Desplegar el código **después** de migrar (el código tolera migraciones faltantes, pero no al revés: migrar primero es lo más simple).
- Autorización de Rifas y edición de Descuentos: solo `javiercastro9912@gmail.com` y `perlarivera@redjuveniltijuana.com` (`DISCOUNT_EDITORS` en `server/teamDiscount.ts`); el servidor responde 403 a cualquier otro Admin aunque se llame a la API a mano.
- Wallet (Apple/Google) fue cancelado y archivado: ver `docs/archive/wallet/README.md`.
