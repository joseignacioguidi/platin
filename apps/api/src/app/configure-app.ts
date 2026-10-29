import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { Response } from 'express';
import helmet from 'helmet';
import { AppConfig } from '../config/app-config';

export const API_PREFIX = 'api/v1';

/** Shared HTTP setup for main.ts and the e2e tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfig);
  app.setGlobalPrefix(API_PREFIX);
  // Requests arrive through Vercel and Render's proxies: use the client IP they forward
  // (rate limiting is per IP).
  (app as NestExpressApplication).set('trust proxy', true);
  app.use(helmet());
  // The secret signs only the oauth_tx cookie (sign-in with a provider in progress).
  app.use(cookieParser(config.env.OAUTH_COOKIE_SECRET));
  // An authentication response must never be cached (Vercel honours the origin's headers).
  app.use(`/${API_PREFIX}/auth`, (_req: unknown, res: Response, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  // Only /health is called cross-origin (wake-up); everything else arrives through the same origin.
  app.enableCors(
    (req: { url?: string }, callback: (err: Error | null, options: object) => void) => {
      const isHealth = (req.url ?? '').startsWith(`/${API_PREFIX}/health`);
      callback(
        null,
        isHealth ? { origin: config.env.APP_ORIGIN, methods: ['GET'] } : { origin: false },
      );
    },
  );
  app.enableShutdownHooks();
}
