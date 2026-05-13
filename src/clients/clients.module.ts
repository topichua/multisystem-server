import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Client, Company, InstagramUser } from "../database/entities";
import { OrdersModule } from "../orders/orders.module";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Client, Company, InstagramUser]),
    OrdersModule,
  ],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
