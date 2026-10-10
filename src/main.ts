import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('text', { type: ['text/csv', 'text/plain'], limit: '10mb' });
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`LeadLens running on http://localhost:${port}`);
}
bootstrap();
