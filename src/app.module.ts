import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { validateEnv } from './config/env.validation';
import { CommonModule } from './common/common.module';
import { AuthGuard } from './common/guards/auth.guard';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { MediaModule } from './modules/media/media.module';
import { PostsModule } from './modules/posts/posts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL_SECONDS', 60) * 1000,
          limit: config.get<number>('THROTTLE_GLOBAL_LIMIT', 100),
        },
      ],
    }),
    CommonModule,
    PrismaModule,
    AuthModule,
    HealthModule,
    UsersModule,
    MediaModule,
    PostsModule,
  ],
  providers: [
    // Order matters (BRD §2.4): ThrottlerGuard -> AuthGuard -> ValidationPipe.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
