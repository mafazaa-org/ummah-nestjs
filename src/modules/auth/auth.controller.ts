import { Controller, Get } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { MediaUrlService } from '../../common/media/media-url.service';
import { toUserMeDto } from '../../common/mappers/user.mapper';

@Controller('auth')
export class AuthController {
  constructor(private readonly mediaUrl: MediaUrlService) {}

  /** First call after login: the guard has already verified the token and provisioned the user. */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return toUserMeDto(user, this.mediaUrl);
  }
}
