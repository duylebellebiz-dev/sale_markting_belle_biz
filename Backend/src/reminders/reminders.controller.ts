import { Controller, Post } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  /** Owner-only: manually trigger the reminder scan immediately (useful for testing) */
  @Roles('owner')
  @Post('trigger')
  trigger() {
    return this.remindersService.triggerNow();
  }
}
