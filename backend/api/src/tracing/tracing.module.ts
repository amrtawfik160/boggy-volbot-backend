import { Global, Module } from '@nestjs/common';
import { TracingService } from './tracing.service';

/**
 * OpenTelemetry Tracing Module
 *
 * Provides distributed tracing capabilities across the entire application.
 * Marked as @Global so TracingService is available everywhere without imports.
 *
 * Import this module in AppModule FIRST before other modules to ensure
 * tracing is initialized before any instrumented code runs.
 */
@Global()
@Module({
  providers: [TracingService],
  exports: [TracingService],
})
export class TracingModule {}
