import { ExecutionContext, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { AccountsModule } from '../accounts/accounts.module';
import { ActivityModule } from '../activity/activity.module';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { CardsModule } from '../cards/cards.module';
import { CategoriesModule } from '../categories/categories.module';
import { CommitmentsModule } from '../commitments/commitments.module';
import { CommonModule } from '../common/common.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { FixedModule } from '../fixed/fixed.module';
import { OriginSecretMiddleware } from '../common/origin-secret.middleware';
import { ProblemDetailsFilter } from '../common/problem-details.filter';
import { RejectNulPipe } from '../common/reject-nul.pipe';
import { AppConfig } from '../config/app-config';
import { ConfigModule } from '../config/config.module';
import { GoalsModule } from '../goals/goals.module';
import { InvestmentsModule } from '../investments/investments.module';
import { HealthModule } from '../health/health.module';
import { MovementsModule } from '../movements/movements.module';
import { PlansModule } from '../plans/plans.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RatesModule } from '../rates/rates.module';
import { SettingsModule } from '../settings/settings.module';
import { SyncModule } from '../sync/sync.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { TransfersModule } from '../transfers/transfers.module';
import { UsersModule } from '../users/users.module';

/** Credential endpoints, the target of brute force. Refresh runs on every app open, so it only
 * gets the general limit. */
const CREDENTIAL_ROUTES = ['/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/password'];
const isCredentialRoute = (context: ExecutionContext): boolean =>
  CREDENTIAL_ROUTES.includes(
    context.switchToHttp().getRequest<Request>().originalUrl.split('?')[0],
  );

/**
 * The client IP for rate limiting. Behind Vercel, X-Forwarded-For keeps whatever the client
 * sent, so even counting proxies it can be forged (SEC-F01); CLIENT_IP_HEADER names a header the
 * edge proxy always overwrites (x-vercel-proxied-for). Without it, the IP Express derives with
 * TRUST_PROXY_HOPS.
 */
export function clientIpOf(req: Request, header: string | undefined): string {
  const value = header ? req.headers[header] : undefined;
  const first = (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim();
  return first || req.ip || 'unknown';
}

@Module({
  imports: [
    ConfigModule,
    CommonModule,
    PrismaModule,
    RatesModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [
          { name: 'default', ttl: 60_000, limit: config.env.THROTTLE_LIMIT },
          {
            name: 'auth',
            ttl: 60_000,
            limit: config.env.THROTTLE_AUTH_LIMIT,
            skipIf: (context) => !isCredentialRoute(context),
          },
        ],
        getTracker: (req) => clientIpOf(req as Request, config.env.CLIENT_IP_HEADER),
      }),
    }),
    HealthModule,
    AuthModule,
    UsersModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    TransfersModule,
    MovementsModule,
    CardsModule,
    FixedModule,
    SyncModule,
    CommitmentsModule,
    DashboardModule,
    GoalsModule,
    InvestmentsModule,
    SettingsModule,
    PlansModule,
    ActivityModule,
    AdminModule,
  ],
  providers: [
    // Global pipes run in order: NUL characters are refused before the Zod schemas.
    { provide: APP_PIPE, useClass: RejectNulPipe },
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
