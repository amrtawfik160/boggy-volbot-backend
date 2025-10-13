// OpenTelemetry tracing MUST be imported first for auto-instrumentation
// It handles Sentry initialization internally when SENTRY_DSN is set
import './tracing/init';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { validateEnvironmentConfig } from './config/environment';
import { createLogger } from './config/logger';

async function bootstrap() {
  // Note: Sentry is initialized in ./tracing/init.ts for OpenTelemetry integration

  // Initialize structured logger
  const logger = createLogger({
    name: 'api',
    environment: process.env.NODE_ENV,
    level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
  });

  // Validate environment configuration before starting
  const envConfig = validateEnvironmentConfig();

  const app = await NestFactory.create(AppModule, {
    logger: false, // Disable default NestJS logger, we'll use Pino
  });

  // Enable global validation pipe with class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: true, // Throw errors if non-whitelisted properties are present
      transform: true, // Automatically transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Allow implicit type conversion
      },
    }),
  );

  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('v1');

  // Setup Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Solana Volume Bot Admin API')
    .setDescription(`
      Admin API endpoints for monitoring and controlling the Solana Volume Bot system.

      ## Authentication
      All admin endpoints require JWT authentication with admin role.

      ## RBAC
      - All endpoints are protected by AdminGuard
      - Only users with 'admin' role can access these endpoints
      - All actions are logged to audit_logs table

      ## Rate Limiting
      - Admin endpoints: 500 requests per minute
      - Standard endpoints: 100 requests per minute
    `)
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Admin Metrics', 'System metrics and queue statistics endpoints')
    .addTag('Admin Campaigns', 'Campaign management and override endpoints')
    .addTag('Admin Users', 'User management endpoints')
    .addTag('Admin System', 'System control and health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  await app.listen(envConfig.apiPort);

  logger.info(`API is running on port ${envConfig.apiPort}`);
  logger.info(`API documentation available at http://localhost:${envConfig.apiPort}/api-docs`);
}

bootstrap().catch(async (err) => {
  const errorLogger = createLogger({ name: 'api', level: 'error' });
  errorLogger.error({ error: err.message, stack: err.stack }, 'API bootstrap failed');

  // Send critical bootstrap error to Sentry (already initialized in tracing/init.ts)
  if (process.env.SENTRY_DSN) {
    const Sentry = await import('@sentry/node');
    Sentry.captureException(err);
    await Sentry.close(2000);
  }

  process.exit(1);
});

