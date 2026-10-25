import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { MEDIA_KEY_REGEX } from '../../../common/constants/media.constants';
import { MEDIA_MAX_PER_POST, POST_TEXT_MAX } from '../../../common/constants/limits.constant';
import { SanitizeText } from '../../../common/utils/sanitizer.util';

export class CreatePostDto {
  @IsOptional()
  @SanitizeText()
  @IsString()
  @MaxLength(POST_TEXT_MAX)
  text?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MEDIA_MAX_PER_POST)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(MEDIA_KEY_REGEX, { each: true })
  mediaKeys?: string[];
}
