import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateCommentDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'التعليق يجب أن يكون 2000 حرف على الأكثر' })
  content?: string;
}
