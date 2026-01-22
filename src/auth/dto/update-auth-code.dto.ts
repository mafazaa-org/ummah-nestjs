import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpdateAuthCodeDto {
  @IsOptional()
  @IsString()
  @Length(70, 70, { message: 'رمز المصادقة يجب أن يكون 70 حرف بالضبط' })
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'رمز المصادقة يجب أن يحتوي على أحرف وأرقام فقط',
  })
  customCode?: string;

  @IsOptional()
  @IsString()
  generateRandom?: string; // If provided, will generate random code
}
