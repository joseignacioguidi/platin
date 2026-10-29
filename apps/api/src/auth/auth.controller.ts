import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { AuthResponse } from '@platin/contracts';
import type { Request, Response } from 'express';
import { ZodSerializerDto } from 'nestjs-zod';
import { Public } from '../common/public.decorator';
import { AuthResponseDto, LoginDto, RegisterDto } from './auth.dto';
import { AuthService, Session } from './auth.service';
import { SessionCookie } from './session-cookie';

export { REFRESH_COOKIE } from './session-cookie';

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookie: SessionCookie,
  ) {}

  @Post('register')
  @ZodSerializerDto(AuthResponseDto)
  async register(
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(await this.auth.register(body), res);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(AuthResponseDto)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(await this.auth.login(body), res);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(AuthResponseDto)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    try {
      return this.respond(await this.auth.refresh(this.cookie.read(req)), res);
    } catch (error) {
      this.cookie.clear(res);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(this.cookie.read(req));
    this.cookie.clear(res);
  }

  private respond(session: Session, res: Response): AuthResponse {
    this.cookie.set(res, session.refreshToken);
    return session.response;
  }
}
