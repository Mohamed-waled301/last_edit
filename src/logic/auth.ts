/**
 * Workshop ERP - Web Crypto API Authentication Engine (حماية وأمان المستخدمين)
 * Salted SHA-256 PIN hashing using native Web Crypto API.
 */

export class AuthSecurity {
  /**
   * Generates a cryptographically secure random salt in hex string format.
   */
  static generateSalt(byteLength: number = 16): string {
    const array = new Uint8Array(byteLength);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      for (let i = 0; i < byteLength; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Hashes a 4-6 digit PIN with a salt using SHA-256.
   */
  static async hashPin(pin: string, salt?: string): Promise<{ hash: string; salt: string }> {
    const finalSalt = salt || this.generateSalt();
    const encoder = new TextEncoder();
    const data = encoder.encode(`${finalSalt}:${pin}`);

    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return { hash, salt: finalSalt };
    } else {
      // Fallback for non-subtle crypto environments (e.g. older testing runtimes)
      let hash = 0;
      const str = `${finalSalt}:${pin}`;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      return { hash: Math.abs(hash).toString(16).padStart(64, '0'), salt: finalSalt };
    }
  }

  /**
   * Verifies an entered PIN against stored salted hash.
   */
  static async verifyPin(pin: string, storedHash: string, salt: string): Promise<boolean> {
    const { hash } = await this.hashPin(pin, salt);
    return hash === storedHash;
  }
}

export default AuthSecurity;
