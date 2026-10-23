import { HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { AppConfig } from '../config/app-config';
import { AppException } from './app-exception';

export const ORIGIN_SECRET_HEADER = 'x-origin-secret';

/**
 * Only accepts requests that come through the Vercel rewrite (which adds the secret header).
 * Disabled when ORIGIN_SECRET is not set. /health is exempt so the front can wake the server directly.
 */
@Injectable()
export class OriginSecretMiddleware implements NestMiddleware {
  constructor(private readonly config: AppConfig) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const secret = this.config.env.ORIGIN_SECRET;
    if (!secret || isHealth(req.originalUrl)) return next();

    const received = req.header(ORIGIN_SECRET_HEADER) ?? '';
    if (!safeEqual(received, secret)) {
      throw new AppException('FORBIDDEN', HttpStatus.FORBIDDEN, 'Direct access is not allowed');
    }
    next();
  }
}

function isHealth(url: string): boolean {
  return url.split('?')[0].replace(/\/$/, '') === '/api/v1/health';
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
