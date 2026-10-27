import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { SanitizeText } from '../../../common/utils/sanitizer.util';
import { LIMITS } from '../../../common/constants/limits.constant';

export class CreateCommentDto {
  @SanitizeText()
  @IsString({ message: 'Comment text must be a string' })
  @IsNotEmpty({ message: 'Comment text cannot be empty' })
  @MaxLength(LIMITS.COMMENT_TEXT_MAX_LENGTH, {
    message: `Comment text must not exceed ${LIMITS.COMMENT_TEXT_MAX_LENGTH} characters`,
  })
  text!: string;
}
