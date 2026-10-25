import { Injectable } from '@nestjs/common';
import { FirebaseDecodedToken, InvalidIdTokenError } from '../src/modules/auth/firebase.types';

const PREFIX = 'test.';

/** Builds a fake ID token understood by FakeFirebaseService. */
export function makeToken(claims: { uid: string; name?: string; email?: string }): string {
  return PREFIX + Buffer.from(JSON.stringify(claims)).toString('base64url');
}

/** Drop-in replacement for FirebaseService in tests: no network, no credentials. */
@Injectable()
export class FakeFirebaseService {
  async verifyIdToken(token: string): Promise<FirebaseDecodedToken> {
    if (!token.startsWith(PREFIX)) throw new InvalidIdTokenError();
    try {
      const claims = JSON.parse(Buffer.from(token.slice(PREFIX.length), 'base64url').toString('utf8'));
      if (typeof claims?.uid !== 'string' || claims.uid.length === 0) throw new Error('no uid');
      return { uid: claims.uid, name: claims.name, email: claims.email };
    } catch {
      throw new InvalidIdTokenError();
    }
  }
}
