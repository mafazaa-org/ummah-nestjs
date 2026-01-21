import { IsString, IsOptional, MaxLength, IsIn } from 'class-validator';

export class CreatePageDto {
  @IsString()
  @MaxLength(100, { message: 'اسم الصفحة يجب أن يكون 100 حرف على الأكثر' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'الوصف يجب أن يكون 500 حرف على الأكثر' })
  description?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsString()
  profileImage?: string;

  @IsOptional()
  @IsIn(['business', 'community', 'brand', 'public_figure', 'other'])
  category?: string;
}
