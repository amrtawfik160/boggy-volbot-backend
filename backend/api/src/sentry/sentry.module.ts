import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SentryService } from './sentry.service';
import { SentryInterceptor } from './sentry.interceptor';
import { SentryTestController } from './sentry-test.controller';

@Global()
@Module({
  controllers: process.env.NODE_ENV === 'production' ? [] : [SentryTestController],
  providers: [
    SentryService,
    {
      provide: APP_INTERCEPTOR,
      useClass: SentryInterceptor,
    },
  ],
  exports: [SentryService],
})
export class SentryModule {}
