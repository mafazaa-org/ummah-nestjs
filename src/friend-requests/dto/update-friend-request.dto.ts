import { IsEnum } from 'class-validator';
import { FriendRequestStatus } from '../schemas/friend-request.schema';

export class UpdateFriendRequestDto {
  @IsEnum(FriendRequestStatus, {
    message: 'الحالة يجب أن تكون: pending, accepted, rejected, cancelled',
  })
  status: FriendRequestStatus;
}
