import {
  IsString,
  IsOptional,
  MaxLength,
  IsUrl,
  MinLength,
  Length,
  Matches,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsUrl({}, { message: 'رابط الصورة غير صحيح' })
  avatar?: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsString()
  @Length(70, 70, { message: 'رمز المصادقة يجب أن يكون 70 حرف بالضبط' })
  @Matches(/^[A-Za-z0-9]+$/, { message: 'رمز المصادقة يجب أن يحتوي على أحرف وأرقام فقط' })
  authCode?: string;
}
