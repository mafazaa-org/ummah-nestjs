import { Controller, Post, Body, HttpCode, HttpStatus, ExecutionContext } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MediaService } from './media.service';
import { PresignDto } from './dto/presign.dto';

// Dynamic Throttler resolver (Resolvable) compatible with @nestjs/throttler v5.2
const presignLimitResolver = (context: ExecutionContext) => {
  const req = context.switchToHttp().getRequest();
  // Access ConfigService or fallback to env directly
  return Number(process.env.THROTTLE_PRESIGN_LIMIT || 20);
};

const presignTtlResolver = (context: ExecutionContext) => {
  return Number(process.env.THROTTLE_TTL_SECONDS || 60) * 1000;
};

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('presign')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: presignLimitResolver,
      ttl: presignTtlResolver,
    },
  })
  async presign(
    @CurrentUser('id') userId: string,
    @Body() dto: PresignDto,
  ) {
    return this.mediaService.presign(userId, dto);
  }
}
