import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { getCorsOrigins, getJwtAccessSecret, getJwtRefreshSecret } from './common/security/secrets';

async function bootstrap() {
  // Fail closed on weak secrets before the app accepts traffic
  getJwtAccessSecret();
  getJwtRefreshSecret();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
    bodyParser: true,
    rawBody: false,
  });

  // Correct client IPs / rate-limit keys behind Nginx
  app.set('trust proxy', 1);

  // Limit request body size (ops API rarely needs multi-MB JSON)
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts:
        process.env.NODE_ENV === 'production'
          ? { maxAge: 31536000, includeSubDomains: true, preload: true }
          : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(cookieParser());

  // CORS — explicit allowlist only
  const origins = getCorsOrigins();
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Validation — strip unknown fields; reject unexpected properties
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      // Avoid leaking internal validation details in production
      disableErrorMessages: process.env.NODE_ENV === 'production',
    }),
  );

  // Swagger (only in non-production)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Hamyar Ops API')
      .setDescription('Server management API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3005;
  await app.listen(port);
  console.log(`Hamyar Ops API running on port ${port}`);
}

bootstrap().catch((err) => {
  console.error('Failed to start Hamyar Ops API:', err?.message || err);
  process.exit(1);
});
