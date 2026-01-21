import { IsString, IsOptional, MaxLength, IsIn } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @MaxLength(100, { message: 'اسم التكتل يجب أن يكون 100 حرف على الأكثر' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'الوصف يجب أن يكون 500 حرف على الأكثر' })
  description?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsIn(['public', 'private'])
  privacy?: string;
}
