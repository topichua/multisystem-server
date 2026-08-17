import { existsSync, readFileSync } from "node:fs";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import type { HttpsOptions } from "@nestjs/common/interfaces/external/https-options.interface";
import { AppModule } from "./app.module";
import { LocationLogger } from "./location-logger";
import { ParseProductFieldFiltersPipe } from "./products/pipes/parse-product-field-filters.pipe";
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

function httpsEnabled(): boolean {
  const flag = process.env.HTTPS?.trim().toLowerCase();
  return flag === "true" || flag === "1";
}

function loadHttpsOptions(): HttpsOptions | undefined {
  if (!httpsEnabled()) {
    return undefined;
  }
  const keyPath =
    process.env.HTTPS_KEY_PATH?.trim() || "certs/localhost-key.pem";
  const certPath =
    process.env.HTTPS_CERT_PATH?.trim() || "certs/localhost-cert.pem";
  if (!existsSync(keyPath) || !existsSync(certPath)) {
    throw new Error(
      `HTTPS=true but cert files are missing. Run: npm run https:cert ` +
        `(expected ${keyPath} and ${certPath})`,
    );
  }
  return {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
  };
}

async function bootstrap() {
  assertStartupEnv();

  const httpsOptions = loadHttpsOptions();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new LocationLogger(),
    rawBody: true,
    httpsOptions,
  });
  app.enableShutdownHooks();
  app.enableCors({ origin: true, credentials: true });

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("ngrok-skip-browser-warning", "true");
    next();
  });

  // ParseProductFieldFiltersPipe MUST run before ValidationPipe. Global pipes
  // run first-to-last: otherwise forbidNonWhitelisted rejects/drops `field:{id}`
  // query keys and characteristic filters never reach the product list.
  app.useGlobalPipes(
    new ParseProductFieldFiltersPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (process.env.SWAGGER_ENABLED !== "false") {
    setupSwagger(app, process.env.SWAGGER_PATH ?? "api");
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
  const scheme = httpsOptions ? "https" : "http";
  console.log(`Server listening on ${scheme}://localhost:${port}`);
}

bootstrap().catch((err: unknown) => {
  if (err instanceof Error) {
    console.error(err.stack ?? err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});
