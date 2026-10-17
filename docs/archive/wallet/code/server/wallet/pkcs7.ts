/**
 * Firma desprendida (PKCS#7 / CMS SignedData, DER) del manifest.json de un .pkpass.
 * Implementación mínima con node:crypto (sin dependencias): SHA-256 + RSA PKCS#1 v1.5 con atributos autenticados
 * (contentType, signingTime, messageDigest), e incluye el certificado de firma y el intermedio WWDR de Apple.
 * Se valida con `openssl smime -verify` en las pruebas. La aceptación final es de iOS (solo se comprueba en un iPhone real).
 */
import { X509Certificate, createHash, createSign, type KeyObject } from 'node:crypto';

const enc = (tag: number, body: Buffer): Buffer => {
  const len = body.length;
  const lenBytes =
    len < 0x80 ? Buffer.from([len]) : len < 0x100 ? Buffer.from([0x81, len]) : len < 0x10000 ? Buffer.from([0x82, len >> 8, len & 0xff]) : Buffer.from([0x83, len >> 16, (len >> 8) & 0xff, len & 0xff]);
  return Buffer.concat([Buffer.from([tag]), lenBytes, body]);
};
const seq = (...p: Buffer[]) => enc(0x30, Buffer.concat(p));
const set = (...p: Buffer[]) => enc(0x31, Buffer.concat(p));
const octet = (b: Buffer) => enc(0x04, b);
const ctx = (n: number, ...p: Buffer[]) => enc(0xa0 + n, Buffer.concat(p)); // [n] EXPLICIT/IMPLICIT constructed
const NULL = Buffer.from([0x05, 0x00]);

function oid(dotted: string): Buffer {
  const parts = dotted.split('.').map(Number);
  const bytes = [parts[0] * 40 + parts[1]];
  for (const n of parts.slice(2)) {
    const stack = [n & 0x7f];
    let v = n >>> 7;
    while (v > 0) {
      stack.unshift((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    bytes.push(...stack);
  }
  return enc(0x06, Buffer.from(bytes));
}
const int1 = (n: number) => enc(0x02, Buffer.from([n]));
const utcTime = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return enc(0x17, Buffer.from(`${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`));
};

/** Lector DER mínimo: devuelve las posiciones de los hijos de una SEQUENCE. */
function children(buf: Buffer, start: number): { tag: number; from: number; to: number; bodyFrom: number }[] {
  const out: { tag: number; from: number; to: number; bodyFrom: number }[] = [];
  let i = start;
  while (i < buf.length) {
    const from = i;
    const tag = buf[i++];
    let len = buf[i++];
    if (len & 0x80) {
      const n = len & 0x7f;
      len = 0;
      for (let k = 0; k < n; k++) len = (len << 8) | buf[i++];
    }
    out.push({ tag, from, to: i + len, bodyFrom: i });
    i += len;
  }
  return out;
}

/** issuerAndSerialNumber del certificado de firma, leído de su DER. */
function issuerAndSerial(certDer: Buffer): Buffer {
  const [cert] = children(certDer, 0);
  const [tbs] = children(certDer, cert.bodyFrom);
  const parts = children(certDer, tbs.bodyFrom);
  let i = 0;
  if (parts[i].tag === 0xa0) i++; // version [0]
  const serial = parts[i];
  const issuer = parts[i + 2]; // serial, signatureAlgorithm, issuer
  return seq(certDer.subarray(issuer.from, issuer.to), certDer.subarray(serial.from, serial.to));
}

export function signDetached(content: Buffer, signerCertPem: string, signerKey: KeyObject, wwdrCertPem: string, now = new Date()): Buffer {
  const signer = new X509Certificate(signerCertPem);
  const wwdr = new X509Certificate(wwdrCertPem);
  const OID_DATA = oid('1.2.840.113549.1.7.1');
  const OID_SIGNED = oid('1.2.840.113549.1.7.2');
  const OID_SHA256 = oid('2.16.840.1.101.3.4.2.1');
  const OID_RSA = oid('1.2.840.113549.1.1.1');

  const digest = createHash('sha256').update(content).digest();
  const attrs = [
    seq(oid('1.2.840.113549.1.9.3'), set(OID_DATA)), // contentType
    seq(oid('1.2.840.113549.1.9.5'), set(utcTime(now))), // signingTime
    seq(oid('1.2.840.113549.1.9.4'), set(octet(digest))), // messageDigest
  ];
  // La firma se calcula sobre los atributos como SET (tag 0x31); en el SignerInfo van como [0] IMPLICIT (tag 0xA0).
  const attrsBody = Buffer.concat(attrs);
  const toSign = enc(0x31, attrsBody);
  const signature = createSign('sha256').update(toSign).sign(signerKey);

  const signerInfo = seq(
    int1(1),
    issuerAndSerial(signer.raw),
    seq(OID_SHA256, NULL),
    enc(0xa0, attrsBody),
    seq(OID_RSA, NULL),
    octet(signature),
  );
  const signedData = seq(
    int1(1),
    set(seq(OID_SHA256, NULL)),
    seq(OID_DATA), // contenido desprendido: sin eContent
    ctx(0, signer.raw, wwdr.raw),
    set(signerInfo),
  );
  return seq(OID_SIGNED, ctx(0, signedData));
}
