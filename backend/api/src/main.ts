import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { validateEnvironmentConfig } from './config/environment';

async function bootstrap() {
  // Validate environment configuration before starting
  const envConfig = validateEnvironmentConfig();

  const app = await NestFactory.create(AppModule);

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
  await app.listen(envConfig.apiPort);

  console.log(`✅ API is running on port ${envConfig.apiPort}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ API bootstrap failed:', err);
  process.exit(1);
});

