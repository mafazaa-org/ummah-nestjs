import { IsNotEmpty, IsString } from 'class-validator';

export class JoinRequestDto {
  @IsNotEmpty()
  @IsString()
  userId: string;
}
