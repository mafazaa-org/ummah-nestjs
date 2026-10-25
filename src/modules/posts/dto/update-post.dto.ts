import { IsString, MaxLength, ValidateIf } from 'class-validator';
import { POST_TEXT_MAX } from '../../../common/constants/limits.constant';
import { SanitizeText } from '../../../common/utils/sanitizer.util';

export class UpdatePostDto {
  @SanitizeText()
  @ValidateIf((o) => o.text !== null)
  @IsString()
  @MaxLength(POST_TEXT_MAX)
  text!: string | null;
}
