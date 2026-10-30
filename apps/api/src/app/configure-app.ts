import { INestApplication, Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { Request, Response } from 'express';
import helmet from 'helmet';
import { AppConfig } from '../config/app-config';

export const API_PREFIX = 'api/v1';

/** Paths under the prefix whose responses hold no user data. */
const PUBLIC_CACHEABLE = ['/plans', '/health'];

/** Shared HTTP setup for main.ts and the e2e tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfig);
  app.setGlobalPrefix(API_PREFIX);
  // Rate limiting is per IP. Trust only the proxies we know of (Vercel and Render), never the
  // whole X-Forwarded-For chain: its left part is whatever the client sent (SEC-F01).
  (app as NestExpressApplication).set('trust proxy', config.env.TRUST_PROXY_HOPS ?? 0);
  if (config.env.LOG_CLIENT_IP) {
    const logger = new Logger('ClientIp');
    app.use(`/${API_PREFIX}/auth/login`, (req: Request, _res: Response, next: () => void) => {
      logger.log(`ip=${req.ip} hops=${req.ips.length} xff=${req.header('x-forwarded-for') ?? ''}`);
      next();
    });
  }
  app.use(helmet());
  // The secret signs only the oauth_tx cookie (sign-in with a provider in progress).
  app.use(cookieParser(config.env.OAUTH_COOKIE_SECRET));
  // Sessions and financial data must never be cached by a proxy or the browser, whatever sits in
  // front of the API (Vercel adds the same header, but the API should not depend on it: SEC-F12).
  // Only the public plan list and /health are not user data.
  app.use(`/${API_PREFIX}`, (req: Request, res: Response, next: () => void) => {
    if (!PUBLIC_CACHEABLE.includes(req.path.replace(/\/$/, ''))) {
      res.setHeader('Cache-Control', 'no-store');
    }
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
