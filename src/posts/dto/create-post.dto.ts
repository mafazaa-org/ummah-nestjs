import { IsString, IsOptional, IsArray, MaxLength, IsUrl, IsMongoId } from 'class-validator';

export class CreatePostDto {
  @IsString()
  @MaxLength(5000, { message: 'المحتوى يجب أن يكون 5000 حرف على الأكثر' })
  content: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true, message: 'يجب أن تكون جميع الروابط صحيحة' })
  images?: string[];

  @IsOptional()
  @IsMongoId({ message: 'معرف التكتل غير صالح' })
  group?: string;

  @IsOptional()
  @IsMongoId({ message: 'معرف الصفحة غير صالح' })
  page?: string;
}
