/**
 * main.ts — Bootstrap of the NestJS application.
 * Configures: CORS, global prefix /api/v1, DTO validation, Swagger.
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Global Prefix ──────────────────────────────────────────────
  // All routes are exposed at /api/v1/* (compatible with the frontend)
  app.setGlobalPrefix('api/v1');

  // ── CORS ────────────────────────────────────────────────────────
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition', 'Content-Length'],
    credentials: false,
  });

  // ── Global DTO Validation Pipe ───────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strips non-whitelisted properties
      forbidNonWhitelisted: true,
      transform: true, // Automatically transforms payload types (e.g. string -> number)
    }),
  );

  // ── Global Exception Filter ────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── Swagger (auto-documentation) ─────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('GAD Cañar — API')
      .setDescription('REST API for the Procedure Management System · GAD Municipal de Cañar')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication and sessions')
      .addTag('requests', 'Management of land request/procedure folders')
      .addTag('users', 'Management of system users')
      .addTag('audit', 'Audit records')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`\n🏛️  GAD Cañar API running at: http://localhost:${port}/api/v1`);
  console.log(`📄 Swagger documentation at:   http://localhost:${port}/api/docs\n`);
}

bootstrap();
