import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { deriveDisplayName } from './auth.utils';
import { FirebaseDecodedToken } from './firebase.types';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Auto-provisioning (BRD §2.4 step 3). Equivalent to `upsert({ update: {} })`, but the hot
   * path (existing user — i.e. almost every request) is a single cheap read with no write attempt.
   * A concurrent first-request race is resolved by catching P2002 and re-reading.
   */
  async provision(decoded: FirebaseDecodedToken): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (existing) return existing;

    try {
      return await this.prisma.user.create({
        data: { firebaseUid: decoded.uid, displayName: deriveDisplayName(decoded) },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.user.findUniqueOrThrow({ where: { firebaseUid: decoded.uid } });
      }
      throw e;
    }
  }
}
