import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { configureApp } from './app/configure-app';
import { AppConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
  });
  configureApp(app);
  const port = app.get(AppConfig).env.PORT;
  await app.listen(port);
  Logger.log(`API listening on port ${port}`, 'Bootstrap');
  await notifyNxReady(app.getHttpServer());
}

/** Lets `nx serve` know the server is up (only set when running under Nx). */
async function notifyNxReady(server: unknown): Promise<void> {
  if (!process.env.NX_READY_SIGNAL_SOCKET) return;
  try {
    // Function keeps webpack from bundling or rewriting the import.
    const load = new Function('s', 'return import(s)') as (
      s: string,
    ) => Promise<{ emitReadySignal(server: unknown): boolean }>;
    (await load('@nx/js/ready-signal')).emitReadySignal(server);
  } catch {
    // @nx/js is not installed (production image).
  }
}

void bootstrap();
