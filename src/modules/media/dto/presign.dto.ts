import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, Min, ValidateIf } from 'class-validator';
import { MediaType } from '@prisma/client';
import { ALL_ALLOWED_CONTENT_TYPES } from '../../../common/constants/media.constants';

export class PresignDto {
  @IsEnum(MediaType)
  type!: MediaType;

  @IsIn(ALL_ALLOWED_CONTENT_TYPES)
  contentType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @ValidateIf((o: PresignDto) => o.type === 'VIDEO')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationSeconds?: number;
}
