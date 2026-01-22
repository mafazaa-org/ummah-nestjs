import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RepostDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'المحتوى المضاف يجب أن يكون أقل من 1000 حرف' })
  additionalContent?: string;
}
