import { IsEnum } from 'class-validator';
import { ReportReason } from '@prisma/client';

export class ReportPostDto {
  @IsEnum(ReportReason, {
    message: 'reason must be one of: RELIGIOUS_VIOLATION, VIOLENCE, SPAM, OTHER',
  })
  reason!: ReportReason;
}
