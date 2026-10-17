import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { walletDiagnostics } from '../../server/wallet/config';
import { canManageRaffles } from '../../server/raffles';

/** Diagnóstico de Wallet (solo nombres, sin valores) y lista de cuentas autorizadas para Rifas. No usa base de datos. */
describe('diagnóstico de Wallet y autorización de Rifas · sin base de datos', () => {
  it('sin variables: dice qué nombres faltan y no inventa problemas', () => {
    const d = walletDiagnostics({});
    assert.equal(d.qr.ok, false);
    assert.deepEqual(d.qr.missing, ['WALLET_QR_SECRET']);
    assert.equal(d.apple.ok, false);
    assert.equal(d.apple.missing.length, 5);
    assert.equal(d.google.missing.length, 4);
    assert.equal(d.apple.issue, null);
  });
  it('nunca devuelve valores de variables', () => {
    const secret = 'S3CRETO-' + 'x'.repeat(40);
    const d = walletDiagnostics({ WALLET_QR_SECRET: secret, APPLE_PASS_TYPE_ID: 'valor-privado-123', GOOGLE_WALLET_SA_KEY: 'otro-valor-privado' });
    assert.ok(!JSON.stringify(d).includes(secret));
    assert.ok(!JSON.stringify(d).includes('valor-privado'));
    assert.equal(d.qr.ok, true);
    assert.ok(d.apple.missing.includes('APPLE_TEAM_ID'));
    assert.ok(!d.apple.missing.includes('APPLE_PASS_TYPE_ID'));
  });
  it('secreto demasiado corto: se explica sin repetirlo', () => {
    const d = walletDiagnostics({ WALLET_QR_SECRET: 'corto' });
    assert.equal(d.qr.ok, false);
    assert.deepEqual(d.qr.missing, []);
    assert.match(d.qr.issue ?? '', /32/);
    assert.ok(!JSON.stringify(d).includes('corto'));
  });
  it('Rifas: solo las dos cuentas autorizadas (sin importar mayúsculas)', () => {
    assert.equal(canManageRaffles('javiercastro9912@gmail.com'), true);
    assert.equal(canManageRaffles(' PerlaRivera@RedJuvenilTijuana.com '), true);
    assert.equal(canManageRaffles('otro@admin.com'), false);
    assert.equal(canManageRaffles(null), false);
    assert.equal(canManageRaffles(undefined), false);
  });
});
