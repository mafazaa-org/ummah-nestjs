import { IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { MEDIA_KEY_REGEX } from '../../../common/constants/media.constants';
import { SanitizeText } from '../../../common/utils/sanitizer.util';

export class UpdateProfileDto {
  @ValidateIf((o) => o.displayName !== undefined) // null is rejected for displayName
  @SanitizeText()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  displayName?: string;

  @IsOptional() // null = clear the bio
  @SanitizeText()
  @IsString()
  @MaxLength(160)
  bio?: string | null;

  @IsOptional() // null = remove the avatar
  @IsString()
  @Matches(MEDIA_KEY_REGEX)
  avatarKey?: string | null;
}
