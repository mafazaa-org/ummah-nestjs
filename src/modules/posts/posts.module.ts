import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { UsersModule } from '../users/users.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { UserPostsController } from './user-posts.controller';

@Module({
  imports: [MediaModule, UsersModule],
  controllers: [PostsController, UserPostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
