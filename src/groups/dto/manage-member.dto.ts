import { IsNotEmpty, IsString } from 'class-validator';

export class ManageMemberDto {
  @IsNotEmpty()
  @IsString()
  userId: string;
}
