import { IsString, MaxLength, IsOptional, IsMongoId } from 'class-validator';

export class CreateCommentDto {
  @IsMongoId({ message: 'معرف المنشور غير صحيح' })
  postId: string;

  @IsString()
  @MaxLength(2000, { message: 'التعليق يجب أن يكون 2000 حرف على الأكثر' })
  content: string;

  @IsOptional()
  @IsMongoId({ message: 'معرف التعليق الأب غير صحيح' })
  parentCommentId?: string; // للردود على التعليقات
}
