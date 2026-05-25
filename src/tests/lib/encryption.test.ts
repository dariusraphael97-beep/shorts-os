import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encryptSecret, decryptSecret, EncryptionVersionError } from '@/lib/encryption';

const KEY_V1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 32 bytes hex
const KEY_V2 = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

describe('encryption', () => {
  beforeEach(() => {
    vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_V1', KEY_V1);
    vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_V2', KEY_V2);
    vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION', '1');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('round-trips with current key version', () => {
    const plaintext = 'refresh-token-secret-value-123';
    const ciphertext = encryptSecret(plaintext);
    expect(ciphertext.version).toBe(1);
    expect(typeof ciphertext.iv).toBe('string');
    expect(typeof ciphertext.tag).toBe('string');
    expect(typeof ciphertext.ciphertext).toBe('string');
    expect(decryptSecret(ciphertext)).toBe(plaintext);
  });

  it('decrypts a v1 row after CURRENT_VERSION is flipped to v2', () => {
    const ciphertext = encryptSecret('secret');
    expect(ciphertext.version).toBe(1);
    vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION', '2');
    expect(decryptSecret(ciphertext)).toBe('secret');
    // New writes use v2
    expect(encryptSecret('next').version).toBe(2);
  });

  it('throws EncryptionVersionError if a key version is missing', () => {
    const ciphertext = { version: 99, iv: 'aa', tag: 'bb', ciphertext: 'cc' };
    expect(() => decryptSecret(ciphertext)).toThrow(EncryptionVersionError);
  });

  it('throws if CURRENT_VERSION env is missing', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_V1', KEY_V1);
    expect(() => encryptSecret('x')).toThrow(/OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION/);
  });
});
