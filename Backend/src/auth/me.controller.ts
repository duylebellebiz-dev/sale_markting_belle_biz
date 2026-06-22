import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';

@Controller('me')
export class MeController {
  @Get()
  getMe(@CurrentUser() user: RequestUser) {
    return { data: user };
  }
}
