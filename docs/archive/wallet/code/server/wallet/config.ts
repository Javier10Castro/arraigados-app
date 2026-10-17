/**
 * Configuración de las credenciales digitales (Apple Wallet / Google Wallet).
 *
 * TODO sale de variables de entorno del SERVIDOR (nunca del navegador ni del repositorio). Cada plataforma se activa
 * por separado: si falta cualquier dato de una plataforma, esa plataforma queda "no configurada" y la interfaz no
 * ofrece su botón. El detalle de lo que falta solo se escribe en el registro del servidor, nunca en la respuesta.
 *
 * Valores PEM: se aceptan con saltos de línea reales, con "\n" escritos como texto (lo habitual en paneles de variables)
 * o codificados en base64 (una sola línea).
 */
import { X509Certificate, createPrivateKey, type KeyObject } from 'node:crypto';

export type AppleWalletConfig = {
  passTypeIdentifier: string;
  teamIdentifier: string;
  signerCertPem: string;
  signerKey: KeyObject;
  wwdrCertPem: string;
};

export type GoogleWalletConfig = {
  issuerId: string;
  serviceAccountEmail: string;
  privateKey: KeyObject;
  classId: string;
  /** Origen público de la app (para `origins` del JWT y la URL del logo). */
  baseUrl: string;
};

export type WalletConfig = {
  /** Secreto con el que se firman los códigos QR y los boletos de descarga. Sin él NO hay Wallet. */
  qrSecret: string | null;
  apple: AppleWalletConfig | null;
  google: GoogleWalletConfig | null;
  /** Qué falta, por plataforma (solo para el registro del servidor). */
  problems: { qr: string | null; apple: string | null; google: string | null };
};

type Env = Record<string, string | undefined>;

export function normalizePem(raw: string | undefined): string | null {
  if (!raw) return null;
  let text = raw.trim();
  if (!text) return null;
  if (!text.includes('-----BEGIN')) {
    // base64 de un PEM completo
    try {
      const decoded = Buffer.from(text, 'base64').toString('utf8');
      if (decoded.includes('-----BEGIN')) text = decoded;
    } catch {
      return null;
    }
  }
  text = text.replace(/\\n/g, '\n').replace(/\r/g, '').trim();
  return text.includes('-----BEGIN') ? text + '\n' : null;
}

const ID_RE = /^[A-Za-z0-9._-]{1,80}$/;

function loadApple(env: Env): { cfg: AppleWalletConfig | null; problem: string | null } {
  const missing = ['APPLE_PASS_TYPE_ID', 'APPLE_TEAM_ID', 'APPLE_PASS_CERT', 'APPLE_PASS_KEY', 'APPLE_WWDR_CERT'].filter((k) => !env[k]?.trim());
  if (missing.length === 5) return { cfg: null, problem: 'sin configurar' };
  if (missing.length) return { cfg: null, problem: `faltan variables: ${missing.join(', ')}` };
  const passTypeIdentifier = env.APPLE_PASS_TYPE_ID!.trim();
  const teamIdentifier = env.APPLE_TEAM_ID!.trim();
  if (!/^pass\.[A-Za-z0-9.-]+$/.test(passTypeIdentifier)) return { cfg: null, problem: 'APPLE_PASS_TYPE_ID debe verse como pass.com.ejemplo.credencial' };
  if (!/^[A-Z0-9]{10}$/.test(teamIdentifier)) return { cfg: null, problem: 'APPLE_TEAM_ID debe tener 10 letras/números (Team ID de Apple Developer)' };
  const certPem = normalizePem(env.APPLE_PASS_CERT);
  const keyPem = normalizePem(env.APPLE_PASS_KEY);
  const wwdrPem = normalizePem(env.APPLE_WWDR_CERT);
  if (!certPem) return { cfg: null, problem: 'APPLE_PASS_CERT no es un certificado PEM' };
  if (!keyPem) return { cfg: null, problem: 'APPLE_PASS_KEY no es una llave PEM' };
  if (!wwdrPem) return { cfg: null, problem: 'APPLE_WWDR_CERT no es un certificado PEM' };
  try {
    const signerKey = createPrivateKey({ key: keyPem, passphrase: env.APPLE_PASS_KEY_PASSPHRASE || undefined });
    const cert = new X509Certificate(certPem);
    new X509Certificate(wwdrPem);
    if (signerKey.asymmetricKeyType !== 'rsa') return { cfg: null, problem: 'la llave de Apple debe ser RSA (como la que genera Apple para el Pass Type ID)' };
    if (!cert.checkPrivateKey(signerKey)) return { cfg: null, problem: 'la llave APPLE_PASS_KEY no corresponde al certificado APPLE_PASS_CERT' };
    if (new Date(cert.validTo).getTime() < Date.now()) return { cfg: null, problem: `el certificado de Apple venció (${cert.validTo})` };
    return { cfg: { passTypeIdentifier, teamIdentifier, signerCertPem: certPem, signerKey, wwdrCertPem: wwdrPem }, problem: null };
  } catch (err) {
    return { cfg: null, problem: `no se pudo leer la llave o los certificados (${err instanceof Error ? err.message : 'error'})` };
  }
}

function loadGoogle(env: Env): { cfg: GoogleWalletConfig | null; problem: string | null } {
  const missing = ['GOOGLE_WALLET_ISSUER_ID', 'GOOGLE_WALLET_SA_EMAIL', 'GOOGLE_WALLET_SA_KEY'].filter((k) => !env[k]?.trim());
  if (missing.length === 3) return { cfg: null, problem: 'sin configurar' };
  if (missing.length) return { cfg: null, problem: `faltan variables: ${missing.join(', ')}` };
  const issuerId = env.GOOGLE_WALLET_ISSUER_ID!.trim();
  if (!/^\d{4,25}$/.test(issuerId)) return { cfg: null, problem: 'GOOGLE_WALLET_ISSUER_ID debe ser el ID numérico del emisor' };
  const email = env.GOOGLE_WALLET_SA_EMAIL!.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { cfg: null, problem: 'GOOGLE_WALLET_SA_EMAIL no parece un correo de cuenta de servicio' };
  const keyPem = normalizePem(env.GOOGLE_WALLET_SA_KEY);
  if (!keyPem) return { cfg: null, problem: 'GOOGLE_WALLET_SA_KEY no es una llave PEM' };
  const suffix = (env.GOOGLE_WALLET_CLASS_SUFFIX || 'arraigados_2k26_credencial').trim();
  if (!ID_RE.test(suffix)) return { cfg: null, problem: 'GOOGLE_WALLET_CLASS_SUFFIX solo admite letras, números, punto, guion y guion bajo' };
  const baseUrl = (env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^/\s]+$/.test(baseUrl) && !/^http:\/\/localhost(:\d+)?$/.test(baseUrl)) {
    return { cfg: null, problem: 'PUBLIC_BASE_URL debe ser el origen https de la app (para el logo y los orígenes del pase)' };
  }
  try {
    const privateKey = createPrivateKey(keyPem);
    return { cfg: { issuerId, serviceAccountEmail: email, privateKey, classId: `${issuerId}.${suffix}`, baseUrl }, problem: null };
  } catch (err) {
    return { cfg: null, problem: `no se pudo leer GOOGLE_WALLET_SA_KEY (${err instanceof Error ? err.message : 'error'})` };
  }
}

export function loadWalletConfig(env: Env = process.env): WalletConfig {
  const secret = env.WALLET_QR_SECRET?.trim() ?? '';
  const qrSecret = secret.length >= 32 ? secret : null;
  const qrProblem = qrSecret ? null : secret ? 'WALLET_QR_SECRET debe tener al menos 32 caracteres' : 'sin configurar WALLET_QR_SECRET';
  const apple = loadApple(env);
  const google = loadGoogle(env);
  return {
    qrSecret,
    // Sin el secreto de los códigos no se puede emitir ningún pase, aunque la plataforma esté completa.
    apple: qrSecret ? apple.cfg : null,
    google: qrSecret ? google.cfg : null,
    problems: { qr: qrProblem, apple: apple.problem, google: google.problem },
  };
}

/** Disponibilidad pública (lo único que ve el navegador). */
export function walletAvailability(cfg: WalletConfig = loadWalletConfig()): { apple: boolean; google: boolean } {
  return { apple: cfg.apple !== null, google: cfg.google !== null };
}

/**
 * Diagnóstico PARA ADMIN (GET /api/wallet/diagnostics): solo NOMBRES de variables y un veredicto; jamás valores,
 * certificados, llaves ni el secreto. `missing` = variables vacías/ausentes; `issue` = por qué una configuración
 * presente no sirve (formato, llave que no corresponde, certificado vencido…), sin repetir contenido de variables.
 */
export type WalletDiagnostics = {
  qr: { ok: boolean; missing: string[]; issue: string | null };
  apple: { ok: boolean; missing: string[]; issue: string | null };
  google: { ok: boolean; missing: string[]; issue: string | null };
};

const APPLE_VARS = ['APPLE_PASS_TYPE_ID', 'APPLE_TEAM_ID', 'APPLE_PASS_CERT', 'APPLE_PASS_KEY', 'APPLE_WWDR_CERT'];
const GOOGLE_VARS = ['GOOGLE_WALLET_ISSUER_ID', 'GOOGLE_WALLET_SA_EMAIL', 'GOOGLE_WALLET_SA_KEY', 'PUBLIC_BASE_URL'];

export function walletDiagnostics(env: Env = process.env): WalletDiagnostics {
  const cfg = loadWalletConfig(env);
  const absent = (names: string[]) => names.filter((k) => !env[k]?.trim());
  const part = (names: string[], ok: boolean, problem: string | null) => {
    const missing = absent(names);
    return { ok, missing, issue: ok || missing.length === names.length ? null : problem };
  };
  const qrMissing = absent(['WALLET_QR_SECRET']);
  return {
    qr: { ok: cfg.qrSecret !== null, missing: qrMissing, issue: qrMissing.length ? null : cfg.problems.qr },
    apple: part(APPLE_VARS, cfg.apple !== null, cfg.problems.apple),
    google: part(GOOGLE_VARS, cfg.google !== null, cfg.problems.google),
  };
}
