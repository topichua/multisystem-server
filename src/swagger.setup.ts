import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
//test
export function setupSwagger(app: INestApplication, path = 'api'): void {
  const config = new DocumentBuilder()
    .setTitle('Multisystem API')
    .setDescription(
      'REST API. Authenticated admin routes require a Bearer JWT from POST /auth/login.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT from POST /auth/login (super_admin role)',
      },
      'bearer',
    )
    .addTag('app', 'Health and status')
    .addTag('auth', 'Authentication')
    .addTag('admin — users', 'User management (super_admin only)')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(path, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      displayRequestDuration: true,
    },
    customSiteTitle: 'Multisystem API — Swagger',
  });
}
