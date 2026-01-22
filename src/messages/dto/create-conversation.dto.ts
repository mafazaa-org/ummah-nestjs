import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsMongoId,
} from 'class-validator';

export class CreateConversationDto {
  @IsEnum(['private', 'group'])
  type: string;

  @IsArray()
  @IsMongoId({ each: true })
  participants: string[];

  @IsOptional()
  @IsMongoId()
  group?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  avatar?: string;
}
