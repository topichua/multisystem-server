import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Client,
  Company,
  Conversation,
  Order,
  OrderDeliveryInfo,
  OrderEvent,
  OrderItem,
  OrderStatus,
  Product,
  ProductVariant,
  Workspace,
} from "../database/entities";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      Workspace,
      Client,
      Conversation,
      OrderStatus,
      Order,
      OrderItem,
      OrderDeliveryInfo,
      OrderEvent,
      Product,
      ProductVariant,
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
