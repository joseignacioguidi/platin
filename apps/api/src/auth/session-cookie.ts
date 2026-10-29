import { Injectable } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AppConfig } from '../config/app-config';
import type { IssuedRefreshToken } from './refresh-token.service';

export const REFRESH_COOKIE = 'platin_rt';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** The httpOnly refresh-token cookie, shared by the password and the provider sign-ins. */
@Injectable()
export class SessionCookie {
  constructor(private readonly config: AppConfig) {}

  set(res: Response, refreshToken: IssuedRefreshToken): void {
    res.cookie(REFRESH_COOKIE, refreshToken.token, {
      ...this.options(),
      expires: refreshToken.expiresAt,
    });
  }

  clear(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, this.options());
  }

  read(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const value = cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' && value ? value : undefined;
  }

  private options(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
    };
  }
}
