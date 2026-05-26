import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Client,
  Conversation,
  Order,
  OrderDeliveryInfo,
  OrderEvent,
  OrderItem,
  OrderStatus,
  Product,
  ProductMedia,
  ProductVariant,
  Workspace,
} from "../database/entities";
import { VariantCustomFieldsModule } from "../variant-custom-fields/variant-custom-fields.module";
import { OrderStatusesController } from "./order-statuses.controller";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [
    VariantCustomFieldsModule,
    TypeOrmModule.forFeature([
      Client,
      Conversation,
      OrderStatus,
      Order,
      OrderItem,
      OrderDeliveryInfo,
      OrderEvent,
      Product,
      ProductMedia,
      ProductVariant,
    ]),
  ],
  controllers: [OrdersController, OrderStatusesController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
