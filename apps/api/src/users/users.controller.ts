import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { User } from '@platin/contracts';
import { ZodSerializerDto } from 'nestjs-zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { UpdateUserDto, UserDto } from './users.dto';
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
}
