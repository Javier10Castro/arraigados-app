// npm run db:estado -- [--cuenta correo@dominio]   -- SOLO LECTURA. No escribe nada.
//
// Dice, sin modificar nada, qué migraciones (011-016) están aplicadas en la base a la que apunta DATABASE_URL
// (muestra solo el nombre del servidor y de la base, nunca la contraseña) y, si se indica --cuenta, el estado de esa cuenta
// del equipo (existe, rol, activa, último restablecimiento de contraseña). No imprime hashes ni contraseñas.
import { connect } from './_db.mjs';

const args = process.argv.slice(2);
const i = args.indexOf('--cuenta');
const cuenta = i >= 0 ? String(args[i + 1] ?? '').trim().toLowerCase() : '';
const listar = args.includes('--equipo');
if (args.some((a, k) => !(a === '--cuenta' || a === '--equipo' || (i >= 0 && k === i + 1)))) {
  console.error('Opción desconocida. Uso: npm run db:estado -- [--cuenta correo@dominio] [--equipo]');
  process.exit(1);
}

const { client, host, database } = connect();
await client.connect();
try {
  await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  console.log(`\nBase: ${database} @ ${host}  (solo lectura)\n`);

  const has = async (sql, params = []) => (await client.query(sql, params)).rows.length > 0;
  const table = (t) => has(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [t]);
  const col = (t, c) => has(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`, [t, c]);
  const nullable = async (t, c) =>
    (await client.query(`SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`, [t, c])).rows[0]?.is_nullable === 'YES';
  const con = (n) => has(`SELECT 1 FROM pg_constraint WHERE conname=$1`, [n]);
  const idx = (n) => has(`SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=$1`, [n]);
  const trg = (n) => has(`SELECT 1 FROM pg_trigger WHERE tgname=$1 AND NOT tgisinternal`, [n]);
  const statusAllowsCancelled = async () =>
    (await client.query(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname='Raffle_status_check'`)).rows[0]?.d?.includes('CANCELLED') ?? false;

  const checks = {
    '011_rate_limit (aparte; no forma parte del plan)': { 'tabla RateLimit': await table('RateLimit') },
    '012_staff_selfredeem': {
      'tabla StaffPulse': await table('StaffPulse'),
      'Redemption.beneficiaryUserId': await col('Redemption', 'beneficiaryUserId'),
      'Redemption.attendeeId admite NULL': await nullable('Redemption', 'attendeeId'),
      'CHECK redemption_one_beneficiary': await con('redemption_one_beneficiary'),
      'tabla SelfRedeemSetting': await table('SelfRedeemSetting'),
      'tabla SelfRedeemOverride': await table('SelfRedeemOverride'),
      'trigger staffpulse_unowned': await trg('staffpulse_unowned'),
      'trigger pulse_team_reserved': await trg('pulse_team_reserved'),
    },
    '013_team_discount': { 'tabla TeamDiscountSetting': await table('TeamDiscountSetting') },
    '014_raffles': {
      'tabla Raffle': await table('Raffle'),
      'tabla RaffleWinner': await table('RaffleWinner'),
      'índice Raffle_package_edition_key': await idx('Raffle_package_edition_key'),
      'índice RaffleWinner_raffle_attendee_key': await idx('RaffleWinner_raffle_attendee_key'),
      'índice RaffleWinner_raffle_position_key': await idx('RaffleWinner_raffle_position_key'),
      'índice RaffleWinner_raffle_drawkey_key': await idx('RaffleWinner_raffle_drawkey_key'),
    },
    '015_team_notes (notas del Staff/Admin)': {
      'Note.userId': await col('Note', 'userId'),
      'NoteLike.userId': await col('NoteLike', 'userId'),
      'Note.attendeeId admite NULL': await nullable('Note', 'attendeeId'),
      'NoteLike.attendeeId admite NULL': await nullable('NoteLike', 'attendeeId'),
      'CHECK note_one_author': await con('note_one_author'),
      'CHECK notelike_one_author': await con('notelike_one_author'),
    },
    '016_raffle_cancel': {
      'Raffle.cancelledAt': await col('Raffle', 'cancelledAt'),
      'Raffle.cancelledById': await col('Raffle', 'cancelledById'),
      'CHECK raffle_cancel_consistent': await con('raffle_cancel_consistent'),
      'Raffle_status_check admite CANCELLED': await statusAllowsCancelled(),
    },
    '017_raffle_entries (inscripción a la rifa con preguntas)': {
      'tabla RaffleEntry': await table('RaffleEntry'),
      'índice RaffleEntry_attendee_package_key': await idx('RaffleEntry_attendee_package_key'),
      'Raffle.winningPosition': await col('Raffle', 'winningPosition'),
      'CHECK raffle_winning_position_valid': await con('raffle_winning_position_valid'),
    },
    '018_raffle_entry_remove (quitar inscritos de la rifa)': {
      'RaffleEntry.removedAt': await col('RaffleEntry', 'removedAt'),
      'RaffleEntry.removedById': await col('RaffleEntry', 'removedById'),
    },
  };
  for (const [mig, items] of Object.entries(checks)) {
    const ok = Object.values(items).every(Boolean);
    const none = Object.values(items).every((v) => !v);
    console.log(`${ok ? '✔ APLICADA ' : none ? '✘ NO APLICADA ' : '⚠ INCOMPLETA '} ${mig}`);
    if (!ok) for (const [k, v] of Object.entries(items)) console.log(`     ${v ? '✔' : '✘'} ${k}`);
  }

  if (listar) {
    // Correos parcialmente ocultos (ab***@dominio): sirve para reconocer la cuenta y luego usar --cuenta con el correo real.
    const mask = (e) => e.replace(/^(.{1,2})[^@]*@/, '$1***@');
    const rows = (await client.query(
      `SELECT u.name, u.email, u.role::text AS role, u.active,
              (SELECT p.status::text FROM "StaffPulse" sp JOIN "Pulse" p ON p.id = sp."pulseId" WHERE sp."userId" = u.id AND sp."unlinkedAt" IS NULL) AS pulse,
              (SELECT max(a."createdAt") FROM "AuditLog" a WHERE a."entityId" = u.id AND a.action = 'user.password_reset') AS reset
         FROM "User" u ORDER BY u.role, lower(u.name)`,
    ).catch(async () => (await client.query(`SELECT u.name, u.email, u.role::text AS role, u.active, NULL AS pulse, NULL AS reset FROM "User" u ORDER BY u.role, lower(u.name)`)))).rows;
    console.log('\nCuentas del equipo:');
    for (const r of rows)
      console.log(`   ${r.role.padEnd(5)} ${r.active ? 'activa    ' : 'DESACTIV. '} ${r.name} <${mask(r.email)}>  pulsera: ${r.pulse ?? 'ninguna'}${r.reset ? `  · último restablecimiento ${r.reset.toISOString()}` : ''}`);
  }

  if (cuenta) {
    console.log(`\nCuenta: ${cuenta}`);
    const u = (await client.query(`SELECT id, role::text AS role, active, "createdAt" FROM "User" WHERE lower(email) = $1`, [cuenta])).rows[0];
    if (!u) console.log('   ✘ No existe una cuenta con ese correo en ESTA base (revisa que sea la base correcta).');
    else {
      console.log(`   Rol: ${u.role} · ${u.active ? 'activa' : 'DESACTIVADA'} · creada ${u.createdAt.toISOString()}`);
      const sp = (await client.query(
        `SELECT p.status::text AS status FROM "StaffPulse" sp JOIN "Pulse" p ON p.id = sp."pulseId" WHERE sp."userId" = $1 AND sp."unlinkedAt" IS NULL`,
        [u.id],
      ).catch(() => ({ rows: null }))).rows;
      console.log(`   Pulsera propia: ${sp === null ? '(no se pudo consultar: falta la migración 012)' : sp.length ? `vinculada (${sp[0].status})${sp[0].status === 'ACTIVE' ? '' : ' — NO está activa: no puede publicar notas'}` : 'NINGUNA vinculada — sin pulsera no puede publicar notas'}`);
      const a = (await client.query(
        `SELECT action, "createdAt" FROM "AuditLog" WHERE "entityId" = $1 AND action IN ('user.create','user.password_reset','user.password_change') ORDER BY "createdAt" DESC LIMIT 3`,
        [u.id],
      )).rows;
      if (!a.length) console.log('   Sin restablecimientos ni cambios de contraseña registrados en la bitácora de ESTA base.');
      for (const r of a) console.log(`   ${r.createdAt.toISOString()}  ${r.action}`);
    }
  }
  console.log('');
} finally {
  await client.end();
}
