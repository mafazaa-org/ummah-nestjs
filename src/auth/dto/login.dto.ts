import { IsNotEmpty, IsString, Length } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'رمز المصادقة مطلوب' })
  @Length(70, 70, { message: 'رمز المصادقة يجب أن يكون 70 حرفاً بالضبط' })
  authCode: string;
}
