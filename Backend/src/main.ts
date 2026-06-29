import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import * as express from 'express';
import { AppModule } from './app.module';

// Campaign metrics (impressions/clicks) are stored as Prisma BigInt; JSON has
// no BigInt representation, so serialize them as strings on every response.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // strip unknown fields
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const allowedOrigins = parseAllowedOrigins(process.env.FRONTEND_URL);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow server-to-server requests and same-origin requests with no Origin header.
      if (!origin) return callback(null, true);

      if (!allowedOrigins.length) {
        return callback(null, origin === 'http://localhost:5173');
      }

      return callback(null, allowedOrigins.includes(origin));
    },
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });

  // Serve uploaded files (logos, email attachments) as static assets
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}`);
}
bootstrap();
