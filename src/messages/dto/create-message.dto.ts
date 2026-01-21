import { IsString, IsOptional, IsEnum, IsMongoId } from 'class-validator';

export class CreateMessageDto {
  @IsMongoId()
  conversation: string;

  @IsEnum(['text', 'image', 'video', 'file'])
  type: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  fileSize?: number;
}
