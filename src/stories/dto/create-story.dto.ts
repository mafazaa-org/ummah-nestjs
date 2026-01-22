import {
  IsString,
  IsUrl,
  IsEnum,
  IsOptional,
  MaxLength,
} from 'class-validator';

export class CreateStoryDto {
  @IsUrl({}, { message: 'رابط الميديا غير صحيح' })
  mediaUrl: string;

  @IsEnum(['image', 'video'], {
    message: 'نوع الميديا يجب أن يكون image أو video',
  })
  mediaType: 'image' | 'video';

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'التعليق يجب أن يكون 500 حرف على الأكثر' })
  caption?: string;
}
