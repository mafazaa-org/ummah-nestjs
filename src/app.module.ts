import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PostsModule } from './posts/posts.module';
import { CommentsModule } from './comments/comments.module';
import { FriendRequestsModule } from './friend-requests/friend-requests.module';
import { StoriesModule } from './stories/stories.module';
import { GroupsModule } from './groups/groups.module';
import { PagesModule } from './pages/pages.module';
import { MessagesModule } from './messages/messages.module';

@Module({
  imports: [
    // Configuration Module
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // MongoDB Connection
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),

    // Rate Limiting for Security
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: (configService.get<number>('RATE_LIMIT_TTL') || 60) * 1000,
            limit: configService.get<number>('RATE_LIMIT_MAX') || 100,
          },
        ],
      }),
      inject: [ConfigService],
    }),

    // Feature Modules
    UsersModule,
    AuthModule,
    PostsModule,
    CommentsModule,
    FriendRequestsModule,
    StoriesModule,
    GroupsModule,
    PagesModule,
    MessagesModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
