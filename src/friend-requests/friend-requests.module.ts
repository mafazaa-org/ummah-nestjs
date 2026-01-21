import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FriendRequestsService } from './friend-requests.service';
import { FriendRequestsController } from './friend-requests.controller';
import {
  FriendRequest,
  FriendRequestSchema,
} from './schemas/friend-request.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FriendRequest.name, schema: FriendRequestSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [FriendRequestsController],
  providers: [FriendRequestsService],
  exports: [FriendRequestsService],
})
export class FriendRequestsModule {}
