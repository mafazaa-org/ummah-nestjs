/** Claims we need from a verified Firebase ID token. */
export interface FirebaseDecodedToken {
  uid: string;
  name?: string;
  email?: string;
}

/** Thrown when a token is present but fails verification (malformed, expired, bad signature...). */
export class InvalidIdTokenError extends Error {
  constructor() {
    super('Invalid or expired token');
    this.name = 'InvalidIdTokenError';
  }
}
