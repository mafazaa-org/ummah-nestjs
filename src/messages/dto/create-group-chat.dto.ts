import {
  IsString,
  IsArray,
  IsMongoId,
  IsOptional,
  MinLength,
} from 'class-validator';

export class CreateGroupChatDto {
  @IsString()
  @MinLength(3, { message: 'اسم المجموعة يجب أن يكون على الأقل 3 أحرف' })
  name: string;

  @IsArray()
  @IsMongoId({ each: true })
  participants: string[];

  @IsOptional()
  @IsString()
  avatar?: string;
}
