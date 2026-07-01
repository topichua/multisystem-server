import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Client,
  ClientLink,
  InstagramUser,
  TelegramUser,
} from "../database/entities";
import { OrdersModule } from "../orders/orders.module";
import { ClientsController } from "./clients.controller";
import { ClientLinksController } from "./client-links.controller";
import { ClientsService } from "./clients.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Client, ClientLink, InstagramUser, TelegramUser]),
    OrdersModule,
  ],
  controllers: [ClientLinksController, ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
