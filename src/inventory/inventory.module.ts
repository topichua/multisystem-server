import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  InventoryMovement,
  InventoryReservation,
  Order,
  OrderItem,
  Product,
  ProductVariant,
} from "../database/entities";
import { VariantCustomFieldsModule } from "../variant-custom-fields/variant-custom-fields.module";
import { WorkspaceSettingsModule } from "../workspace-settings/workspace-settings.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";

@Module({
  imports: [
    VariantCustomFieldsModule,
    WorkspaceSettingsModule,
    TypeOrmModule.forFeature([
      InventoryMovement,
      InventoryReservation,
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
