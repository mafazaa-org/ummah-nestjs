import { IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateGroupSettingsDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowMembersToPost?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  showMemberNames?: boolean;
}
