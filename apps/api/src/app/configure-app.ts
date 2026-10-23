import { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { AppConfig } from '../config/app-config';

export const API_PREFIX = 'api/v1';

/** Shared HTTP setup for main.ts and the e2e tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfig);
  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
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
