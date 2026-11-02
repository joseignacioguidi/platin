import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import type { DataSummary, User } from '@platin/contracts';
import { ZodSerializerDto } from 'nestjs-zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { DataSummaryDto, ResetRequestDto, UpdateUserDto, UserDto } from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ZodSerializerDto(UserDto)
  me(@CurrentUser() user: AuthUser): Promise<User> {
    return this.users.get(user.id);
  }

  @Patch('me')
  @ZodSerializerDto(UserDto)
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateUserDto): Promise<User> {
    return this.users.update(user.id, body);
  }

  /** AUTH-09: what starting over would delete. */
  @Get('me/data-summary')
  @ZodSerializerDto(DataSummaryDto)
  dataSummary(@CurrentUser() user: AuthUser): Promise<DataSummary> {
    return this.users.dataSummary(user.id);
  }

  /** AUTH-09: deletes the financial data and leaves the account like a new one. */
  @Post('me/reset')
  @HttpCode(200)
  @ZodSerializerDto(DataSummaryDto)
  reset(@CurrentUser() user: AuthUser, @Body() body: ResetRequestDto): Promise<DataSummary> {
    return this.users.reset(user.id, body);
  }
}
