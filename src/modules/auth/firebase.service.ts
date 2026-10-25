import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApp, getApps, initializeApp, App } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { FirebaseDecodedToken, InvalidIdTokenError } from './firebase.types';

@Injectable()
export class FirebaseService {
  private app?: App;

  constructor(private readonly config: ConfigService) {}

  /**
   * Lazy initialisation: the Admin SDK is only started on the first verification, so the
   * application (and /health) boots without real Firebase credentials.
   * Initialisation errors are NOT swallowed: they surface as 500, never as INVALID_TOKEN.
   */
  private getAuthClient(): Auth {
    if (!this.app) {
      this.app = getApps().length
        ? getApp()
        : initializeApp({
            credential: cert({
              projectId: this.config.getOrThrow<string>('FIREBASE_PROJECT_ID'),
              clientEmail: this.config.getOrThrow<string>('FIREBASE_CLIENT_EMAIL'),
              // .env stores the key on one line with literal "\n" sequences.
              privateKey: this.config.getOrThrow<string>('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
            }),
          });
    }
    return getAuth(this.app);
  }

  /** `checkRevoked` is intentionally not used in V1 (BRD 2.4, note 3). */
  async verifyIdToken(token: string): Promise<FirebaseDecodedToken> {
    const auth = this.getAuthClient();
    try {
      const decoded = await auth.verifyIdToken(token);
      return { uid: decoded.uid, name: decoded.name, email: decoded.email };
    } catch {
      throw new InvalidIdTokenError();
    }
  }
}
