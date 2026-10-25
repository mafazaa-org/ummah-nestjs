import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_MODE_KEY, AuthMode } from '../decorators/auth-mode.decorator';
import { AppException } from '../exceptions/app.exception';
import { extractBearer } from '../../modules/auth/auth.utils';
import { AuthService } from '../../modules/auth/auth.service';
import { FirebaseService } from '../../modules/auth/firebase.service';
import { InvalidIdTokenError } from '../../modules/auth/firebase.types';

/** Global guard (BRD §2.4). Runs after ThrottlerGuard and before ValidationPipe. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly firebase: FirebaseService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const mode =
      this.reflector.getAllAndOverride<AuthMode>(AUTH_MODE_KEY, [context.getHandler(), context.getClass()]) ??
      'MANDATORY';
    const req = context.switchToHttp().getRequest();

    // 1) Guest mode: any token on a PUBLIC route is ignored (even an invalid one).
    if (mode === 'PUBLIC') {
      req.user = null;
      return true;
    }

    const token = extractBearer(req.headers.authorization);
    if (!token) {
      if (mode === 'OPTIONAL') {
        req.user = null;
        return true;
      }
      throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Missing bearer token');
    }

    // 2) A present-but-invalid token is NEVER downgraded to guest.
    let decoded;
    try {
      decoded = await this.firebase.verifyIdToken(token);
    } catch (e) {
      if (e instanceof InvalidIdTokenError) {
        throw new AppException(HttpStatus.UNAUTHORIZED, 'INVALID_TOKEN', 'Invalid or expired token');
      }
      throw e; // infrastructure/config failure -> 500, not a client error
    }

    // 3) Auto-provision.
    const user = await this.authService.provision(decoded);

    // 4) Status enforcement from the DB on EVERY request (the token lives ~1h; the DB is the truth).
    if (user.status === 'SUSPENDED') {
      throw new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_SUSPENDED', 'Account is suspended');
    }

    req.user = user;
    return true;
  }
}
