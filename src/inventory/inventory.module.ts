import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Order,
  OrderItem,
  Product,
  ProductVariant,
  StockMovement,
  VariantStock,
  Workspace,
} from "../database/entities";
import { VariantCustomFieldsModule } from "../variant-custom-fields/variant-custom-fields.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";

@Module({
  imports: [
    VariantCustomFieldsModule,
    TypeOrmModule.forFeature([
      StockMovement,
      VariantStock,
      Workspace,
      ProductVariant,
      Product,
      Order,
      OrderItem,
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
