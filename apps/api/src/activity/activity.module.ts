import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ActivityInterceptor } from './activity.interceptor';

@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: ActivityInterceptor }],
})
export class ActivityModule {}
