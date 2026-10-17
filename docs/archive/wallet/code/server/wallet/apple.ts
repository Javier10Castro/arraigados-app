/**
 * Pase de Apple Wallet (.pkpass) de la credencial de Arraigados 2K26.
 * Estructura (documentación de Apple «Building a pass»): pass.json + imágenes + manifest.json (SHA-1 de cada archivo)
 * + signature (PKCS#7 desprendido del manifest) dentro de un ZIP. Tipo de contenido: application/vnd.apple.pkpass.
 * Campos usados: SOLO los del modelo actual (nombre, iglesia, identificador público, QR). Sin ubicaciones ni fechas de
 * relevancia, para que nada aparezca en la pantalla bloqueada.
 */
import { createHash } from 'node:crypto';
import type { AppleWalletConfig } from './config';
import { PASS_IMAGES } from './assets';
import { WALLET_EVENT, type WalletSubject } from './event';
import { makeWalletCode, publicCredentialId } from './code';
import { signDetached } from './pkcs7';
import { makeZip } from './zip';

export const PKPASS_MIME = 'application/vnd.apple.pkpass';

export function applePassJson(cfg: AppleWalletConfig, qrSecret: string, subject: WalletSubject) {
  const code = makeWalletCode(qrSecret, subject.pulseId);
  const credentialId = publicCredentialId(qrSecret, subject.pulseId);
  const secondary = subject.churchName
    ? [{ key: 'church', label: 'IGLESIA', value: subject.churchName }]
    : [{ key: 'role', label: 'PARTICIPA COMO', value: 'Equipo' }];
  return {
    formatVersion: 1,
    passTypeIdentifier: cfg.passTypeIdentifier,
    teamIdentifier: cfg.teamIdentifier,
    // Único por pulsera: volver a agregarlo reemplaza el mismo pase en lugar de duplicarlo.
    serialNumber: `ar26-${subject.pulseId}`,
    organizationName: WALLET_EVENT.organizer,
    description: 'Credencial Arraigados 2K26',
    logoText: WALLET_EVENT.name,
    foregroundColor: 'rgb(242, 247, 215)',
    backgroundColor: 'rgb(62, 7, 166)',
    labelColor: 'rgb(192, 184, 223)',
    sharingProhibited: true,
    barcodes: [{ format: 'PKBarcodeFormatQR', message: code, messageEncoding: 'iso-8859-1', altText: credentialId }],
    eventTicket: {
      primaryFields: [{ key: 'holder', label: 'TITULAR', value: subject.holderName }],
      secondaryFields: secondary,
      auxiliaryFields: [
        { key: 'dates', label: 'FECHAS', value: WALLET_EVENT.dates },
        { key: 'credential', label: 'CREDENCIAL', value: credentialId, textAlignment: 'PKTextAlignmentRight' },
      ],
      backFields: [
        { key: 'event', label: 'Evento', value: `${WALLET_EVENT.name} · ${WALLET_EVENT.organizer}` },
        { key: 'venues', label: 'Sedes', value: `${WALLET_EVENT.venues}, ${WALLET_EVENT.city}` },
        {
          key: 'howto',
          label: 'Cómo usarla',
          value: 'Muestra este código al equipo Staff para canjear tus aguas frescas. La credencial es personal: no la compartas.',
        },
      ],
    },
  };
}

export function buildPkpass(cfg: AppleWalletConfig, qrSecret: string, subject: WalletSubject, now = new Date()): Buffer {
  const files: { name: string; data: Buffer }[] = [{ name: 'pass.json', data: Buffer.from(JSON.stringify(applePassJson(cfg, qrSecret, subject)), 'utf8') }];
  for (const [name, b64] of Object.entries(PASS_IMAGES)) files.push({ name, data: Buffer.from(b64, 'base64') });
  const manifest: Record<string, string> = {};
  for (const f of files) manifest[f.name] = createHash('sha1').update(f.data).digest('hex'); // Apple exige SHA-1 en el manifest
  const manifestBuf = Buffer.from(JSON.stringify(manifest), 'utf8');
  const signature = signDetached(manifestBuf, cfg.signerCertPem, cfg.signerKey, cfg.wwdrCertPem, now);
  return makeZip([...files, { name: 'manifest.json', data: manifestBuf }, { name: 'signature', data: signature }]);
}
