import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { LocationLogger } from "./location-logger";
import { setupSwagger } from "./swagger.setup";

function assertStartupEnv(): void {
  const missing: string[] = [];
  if (!process.env.JWT_SECRET?.trim()) {
    missing.push("JWT_SECRET");
  }
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
  const hasDbParts = Boolean(
    process.env.DB_HOST?.trim() &&
      process.env.DB_USERNAME?.trim() &&
      process.env.DB_NAME?.trim(),
  );
  if (!hasDatabaseUrl && !hasDbParts) {
    missing.push("DATABASE_URL (or DB_HOST + DB_USERNAME + DB_NAME)");
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}

async function bootstrap() {
  assertStartupEnv();

  const app = await NestFactory.create(AppModule, {
    logger: new LocationLogger(),
  });
  app.enableCors({ origin: true, credentials: true });

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("ngrok-skip-browser-warning", "true");
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (process.env.SWAGGER_ENABLED !== "false") {
    setupSwagger(app, process.env.SWAGGER_PATH ?? "api");
  }

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((err: unknown) => {
  if (err instanceof Error) {
    console.error(err.stack ?? err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});
