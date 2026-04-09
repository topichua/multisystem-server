import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';

/**
 * Opaque invitation tokens: generate raw token for email links, store only SHA-256 hex digest.
 */
@Injectable()
export class InvitationTokenService {
  generateRawToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(rawToken: string): string {
    return createHash('sha256').update(rawToken, 'utf8').digest('hex');
  }

  verify(rawToken: string, storedHash: string | null): boolean {
    if (!storedHash) {
      return false;
    }
    const computed = this.hash(rawToken);
    try {
      const a = Buffer.from(computed, 'hex');
      const b = Buffer.from(storedHash, 'hex');
      if (a.length !== b.length) {
        return false;
      }
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}
