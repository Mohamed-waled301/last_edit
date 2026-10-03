import { describe, it, expect } from 'vitest';
import AuthSecurity from '../auth';

describe('AuthSecurity - Web Crypto PIN Hashing', () => {
  it('generates a 32-character hex salt', () => {
    const salt = AuthSecurity.generateSalt(16);
    expect(salt).toHaveLength(32);
    expect(/^[0-9a-f]+$/i.test(salt)).toBe(true);
  });

  it('hashes a PIN and produces a valid 64-char hex hash', async () => {
    const { hash, salt } = await AuthSecurity.hashPin('1234');
    expect(hash).toHaveLength(64);
    expect(salt).toBeDefined();
  });

  it('verifies the correct PIN matches the hash and wrong PIN fails', async () => {
    const pin = '5678';
    const { hash, salt } = await AuthSecurity.hashPin(pin);

    const isMatch = await AuthSecurity.verifyPin(pin, hash, salt);
    expect(isMatch).toBe(true);

    const isWrong = await AuthSecurity.verifyPin('9999', hash, salt);
    expect(isWrong).toBe(false);
  });
});
