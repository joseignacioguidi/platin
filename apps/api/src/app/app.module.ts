import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { OriginSecretMiddleware } from '../common/origin-secret.middleware';
import { ProblemDetailsFilter } from '../common/problem-details.filter';
import { ConfigModule } from '../config/config.module';
import { HealthModule } from '../health/health.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule, HealthModule],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(OriginSecretMiddleware).forRoutes('*path');
  }
}
