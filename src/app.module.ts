import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { ConversationsModule } from './conversations/conversations.module';
import { AccountModule } from './account/account.module';
import { getTypeOrmModuleOptions } from './database/typeorm-connection-options';
import { WebhookModule } from './webhook/webhook.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) =>
        getTypeOrmModuleOptions({
          DATABASE_URL: config.get<string>('DATABASE_URL'),
          DB_HOST: config.get<string>('DB_HOST'),
          DB_PORT: config.get<string>('DB_PORT'),
          DB_USERNAME: config.get<string>('DB_USERNAME'),
          DB_PASSWORD: config.get<string>('DB_PASSWORD'),
          DB_NAME: config.get<string>('DB_NAME'),
          DB_LOGGING: config.get<string>('DB_LOGGING'),
        }),
      inject: [ConfigService],
    }),
    UsersModule,
    CompaniesModule,
    ConversationsModule,
    AccountModule,
    WebhookModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
