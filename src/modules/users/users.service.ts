import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { MEDIA_KEY_VERIFIER, MediaKeyVerifier } from '../../common/media/media-key-verifier';
import { MediaUrlService } from '../../common/media/media-url.service';
import { toUserMeDto, toUserPublicDto, UserMeDto, UserPublicDto } from '../../common/mappers/user.mapper';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaUrl: MediaUrlService,
    @Inject(MEDIA_KEY_VERIFIER) private readonly mediaVerifier: MediaKeyVerifier,
  ) {}

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserMeDto> {
    // `null` counts as a provided value (it clears bio/avatar); only `undefined` means "absent".
    if (dto.displayName === undefined && dto.bio === undefined && dto.avatarKey === undefined) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'EMPTY_UPDATE', 'At least one field must be provided');
    }

    if (typeof dto.avatarKey === 'string') {
      await this.mediaVerifier.verifyMediaKeys(userId, [dto.avatarKey], 'AVATAR');
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.bio !== undefined) data.bio = dto.bio === null || dto.bio === '' ? null : dto.bio;
    if (dto.avatarKey !== undefined) data.avatarKey = dto.avatarKey;

    const user: User = await this.prisma.user.update({ where: { id: userId }, data });
    return toUserMeDto(user, this.mediaUrl);
  }

  async getPublicProfile(id: string): Promise<UserPublicDto> {
    const user = await this.findActiveOrThrow(id);
    return toUserPublicDto(user, this.mediaUrl);
  }

  /** Used by other modules that must 404 on missing/suspended users without needing the DTO. */
  async ensureActive(id: string): Promise<void> {
    await this.findActiveOrThrow(id);
  }

  private async findActiveOrThrow(id: string): Promise<User> {
    // Suspended users are indistinguishable from non-existent ones (BRD §4.4).
    const user = await this.prisma.user.findFirst({ where: { id, status: 'ACTIVE' } });
    if (!user) {
      throw new AppException(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'User not found');
    }
    return user;
  }
}

