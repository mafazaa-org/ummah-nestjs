import { IsMongoId } from 'class-validator';

export class CreateFriendRequestDto {
  @IsMongoId({ message: 'معرف المستخدم غير صحيح' })
  receiverId: string;
}
