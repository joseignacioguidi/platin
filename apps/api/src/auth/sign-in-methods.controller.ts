import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  idParamSchema,
  setPasswordRequestSchema,
  signInMethodsResponseSchema,
  type SignInMethodsResponse,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { SignInMethodsService } from './sign-in-methods.service';

class IdParamDto extends createZodDto(idParamSchema) {}
class SetPasswordDto extends createZodDto(setPasswordRequestSchema) {}
class SignInMethodsResponseDto extends createZodDto(signInMethodsResponseSchema) {}

/** AUTH-07 and AUTH-08, for the signed-in user. */
@Controller('auth')
export class SignInMethodsController {
  constructor(private readonly methods: SignInMethodsService) {}

  @Get('identities')
  @ZodSerializerDto(SignInMethodsResponseDto)
  list(@CurrentUser() user: AuthUser): Promise<SignInMethodsResponse> {
    return this.methods.list(user.id);
  }

  @Delete('identities/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  unlink(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<void> {
    return this.methods.unlink(user.id, params.id);
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  setPassword(@CurrentUser() user: AuthUser, @Body() body: SetPasswordDto): Promise<void> {
    return this.methods.setPassword(user.id, body.password);
  }
}
