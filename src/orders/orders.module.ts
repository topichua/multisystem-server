import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Client,
  InstagramIntegration,
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
import { OrderStatusesController } from "./order-statuses.controller";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstagramIntegration,
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
  controllers: [OrdersController, OrderStatusesController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
