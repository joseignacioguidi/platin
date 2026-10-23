import { ExecutionContext, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { AuthModule } from '../auth/auth.module';
import { OriginSecretMiddleware } from '../common/origin-secret.middleware';
import { ProblemDetailsFilter } from '../common/problem-details.filter';
import { AppConfig } from '../config/app-config';
import { ConfigModule } from '../config/config.module';
import { HealthModule } from '../health/health.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';

const isAuthRoute = (context: ExecutionContext): boolean =>
  context.switchToHttp().getRequest<Request>().originalUrl.startsWith('/api/v1/auth');

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => [
        { name: 'default', ttl: 60_000, limit: config.env.THROTTLE_LIMIT },
        {
          name: 'auth',
          ttl: 60_000,
          limit: config.env.THROTTLE_AUTH_LIMIT,
          skipIf: (context) => !isAuthRoute(context),
        },
      ],
    }),
    HealthModule,
    AuthModule,
    UsersModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    // Throttle before authenticating, so brute force is limited even without a token.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(OriginSecretMiddleware).forRoutes('*path');
  }
}
