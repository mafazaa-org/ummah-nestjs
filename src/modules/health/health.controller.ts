import { Controller, Get, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../../common/decorators/auth-mode.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { AppException } from '../../common/exceptions/app.exception';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  @SkipThrottle()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        db: 'up',
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'SERVICE_UNAVAILABLE',
        'Database unavailable',
      );
    }
  }
}
