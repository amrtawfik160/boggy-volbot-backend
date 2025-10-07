import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('v1');
  const port = process.env.API_PORT ? Number(process.env.API_PORT) : 3001;
  await app.listen(port);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('API bootstrap failed', err);
  process.exit(1);
});

