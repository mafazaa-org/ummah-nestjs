import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { Group, GroupSchema } from './schemas/group.schema';
import { Conversation, ConversationSchema } from '../messages/schemas/conversation.schema';
import { JoinRequest, JoinRequestSchema } from './schemas/join-request.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Group.name, schema: GroupSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: JoinRequest.name, schema: JoinRequestSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
