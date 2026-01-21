import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(3, { message: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' })
  @MaxLength(30, { message: 'اسم المستخدم يجب أن يكون 30 حرف على الأكثر' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'اسم المستخدم يمكن أن يحتوي على أحرف وأرقام وشرطة سفلية فقط',
  })
  username: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'الاسم الأول يجب أن يكون حرفين على الأقل' })
  @MaxLength(50, { message: 'الاسم الأول يجب أن يكون 50 حرف على الأكثر' })
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'اسم العائلة يجب أن يكون حرفين على الأقل' })
  @MaxLength(50, { message: 'اسم العائلة يجب أن يكون 50 حرف على الأكثر' })
  lastName?: string;
}
