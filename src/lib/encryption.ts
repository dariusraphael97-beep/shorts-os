// src/lib/encryption.ts
//
// AES-256-GCM with key-version dispatch. Used for channels.oauth_refresh_token_encrypted.
// Plaintext is encrypted under the CURRENT version's key. Ciphertext carries the
// version so old rows stay decryptable across key rotations.
//
// Rotation playbook:
//   1. Add OAUTH_TOKEN_ENCRYPTION_KEY_V2 env var; deploy.
//   2. Flip OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION=2; deploy.
//   3. Old rows decrypt with V1; new writes encrypt with V2.
//   4. Opportunistic re-encrypt on next row write (e.g., next OAuth reconsent).
import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, type CipherGCMTypes } from 'node:crypto';

const ALGORITHM: CipherGCMTypes = 'aes-256-gcm';
const IV_BYTES = 12;     // GCM standard
const KEY_BYTES = 32;    // AES-256

export class EncryptionVersionError extends Error {
  constructor(version: number) {
    super(`Encryption key version ${version} not configured (set OAUTH_TOKEN_ENCRYPTION_KEY_V${version})`);
    this.name = 'EncryptionVersionError';
  }
}

export interface EncryptedSecret {
  version: number;
  iv: string;          // base64
  tag: string;         // base64
  ciphertext: string;  // base64
}

function getKeyForVersion(version: number): Buffer {
  const env = process.env[`OAUTH_TOKEN_ENCRYPTION_KEY_V${version}`];
  if (!env) throw new EncryptionVersionError(version);
  const key = Buffer.from(env, 'hex');
  if (key.length !== KEY_BYTES) {
    throw new Error(`OAUTH_TOKEN_ENCRYPTION_KEY_V${version} must be ${KEY_BYTES * 2} hex chars (got ${env.length})`);
  }
  return key;
}

function getCurrentVersion(): number {
  const raw = process.env.OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION;
  if (!raw) throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION must be set');
  const v = parseInt(raw, 10);
  if (!Number.isFinite(v) || v < 1) throw new Error(`Invalid OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION=${raw}`);
  return v;
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const version = getCurrentVersion();
  const key = getKeyForVersion(version);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptSecret(blob: EncryptedSecret): string {
  const key = getKeyForVersion(blob.version);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(blob.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(blob.ciphertext, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
}
