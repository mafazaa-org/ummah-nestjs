import { IsString, IsOptional, IsArray, MaxLength, IsUrl } from 'class-validator';

export class UpdatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'المحتوى يجب أن يكون 5000 حرف على الأكثر' })
  content?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true, message: 'يجب أن تكون جميع الروابط صحيحة' })
  images?: string[];
}
