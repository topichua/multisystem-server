import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { LocationLogger } from './location-logger';
import { setupSwagger } from './swagger.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new LocationLogger(),
  });
  app.enableCors({ origin: true, credentials: true });

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (process.env.SWAGGER_ENABLED !== 'false') {
    setupSwagger(app, process.env.SWAGGER_PATH ?? 'api');
  }

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
