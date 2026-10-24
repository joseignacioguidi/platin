import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { AuthResponse } from '@platin/contracts';
import type { CookieOptions, Request, Response } from 'express';
import { ZodSerializerDto } from 'nestjs-zod';
import { Public } from '../common/public.decorator';
import { AppConfig } from '../config/app-config';
import { AuthResponseDto, LoginDto, RegisterDto } from './auth.dto';
import { AuthService, Session } from './auth.service';

export const REFRESH_COOKIE = 'platin_rt';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
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
      return this.respond(await this.auth.refresh(readCookie(req)), res);
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(readCookie(req));
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  private respond(session: Session, res: Response): AuthResponse {
    res.cookie(REFRESH_COOKIE, session.refreshToken.token, {
      ...this.cookieOptions(),
      expires: session.refreshToken.expiresAt,
    });
    return session.response;
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
    };
  }
}

function readCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value ? value : undefined;
}
