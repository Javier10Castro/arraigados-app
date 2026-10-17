/**
 * Enlace «Add to Google Wallet» (pase genérico) firmado en el servidor.
 * El JWT (RS256, cuenta de servicio) lleva la clase y el objeto; Google crea/actualiza la clase al guardar el pase.
 * La llave privada de la cuenta de servicio nunca sale del servidor. Mientras la cuenta del emisor esté en modo
 * demostración, solo los usuarios de prueba agregados en la consola de Google Wallet pueden guardar el pase; para
 * cualquier otra persona Google exige la aprobación del emisor (ver docs/WALLET.md).
 */
import { sign } from 'node:crypto';
import type { GoogleWalletConfig } from './config';
import { WALLET_EVENT, type WalletSubject } from './event';
import { makeWalletCode, publicCredentialId } from './code';

const LANG = 'es-MX';
const text = (value: string) => ({ defaultValue: { language: LANG, value } });

export function googleObjectId(cfg: GoogleWalletConfig, pulseId: string) {
  return `${cfg.issuerId}.ar26_${pulseId}`;
}

export function googlePayload(cfg: GoogleWalletConfig, qrSecret: string, subject: WalletSubject) {
  const code = makeWalletCode(qrSecret, subject.pulseId);
  const credentialId = publicCredentialId(qrSecret, subject.pulseId);
  return {
    genericClasses: [{ id: cfg.classId }],
    genericObjects: [
      {
        id: googleObjectId(cfg, subject.pulseId),
        classId: cfg.classId,
        state: 'ACTIVE',
        cardTitle: text(WALLET_EVENT.name),
        header: text(subject.holderName),
        subheader: text(subject.churchName ?? 'Equipo'),
        hexBackgroundColor: WALLET_EVENT.background,
        logo: { sourceUri: { uri: `${cfg.baseUrl}/wallet/logo.png` } },
        barcode: { type: 'QR_CODE', value: code, alternateText: credentialId },
        textModulesData: [{ id: 'fechas', header: 'Fechas', body: WALLET_EVENT.dates }], // el identificador público ya va como texto del QR (alternateText)
      },
    ],
  };
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function buildGoogleSaveUrl(cfg: GoogleWalletConfig, qrSecret: string, subject: WalletSubject, nowMs = Date.now()): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: cfg.serviceAccountEmail,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(nowMs / 1000),
    origins: [cfg.baseUrl],
    payload: googlePayload(cfg, qrSecret, subject),
  };
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(claims))}`;
  const signature = sign('sha256', Buffer.from(input), cfg.privateKey);
  return `https://pay.google.com/gp/v/save/${input}.${b64u(signature)}`;
}
