import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Allow requests from the React dev servers on any localhost port (Vite picks the next free one)
  app.enableCors({
    origin: /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
  });

  // Global validation pipe — transforms query params and validates all DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Larger accept backlog: k6 opens ~1000 connections in the first second and
  // Node's default backlog (511) drops the overflow, showing up as HTTP 0 errors.
  // '::' = dual-stack, so both localhost (::1) and 127.0.0.1 still work.
  await app.listen(process.env.PORT ?? 3000, '::', 4096 as never);
}
await bootstrap();
