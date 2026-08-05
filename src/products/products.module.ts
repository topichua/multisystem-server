import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  ClientWishlistItem,
  Product,
  ProductCategory,
  ProductMedia,
  ProductVariant,
  UploadMedia,
  OrderItem,
} from "../database/entities";
import { ProductExport } from "../database/entities/product-export.entity";
import { CloudflareImagesService } from "./cloudflare-images.service";
import { VariantCustomFieldsModule } from "../variant-custom-fields/variant-custom-fields.module";
import { InventoryModule } from "../inventory/inventory.module";
import { StorageModule } from "../storage/storage.module";
import { WorkspaceSettingsModule } from "../workspace-settings/workspace-settings.module";
import { ProductMediaService } from "./product-media.service";
import { UploadMediaService } from "./upload-media.service";
import { ProductExportWorkerService } from "./product-export-worker.service";
import { ProductExportsService } from "./product-exports.service";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

@Module({
  imports: [
    WorkspaceSettingsModule,
    VariantCustomFieldsModule,
    InventoryModule,
    StorageModule,
    TypeOrmModule.forFeature([
      Product,
      ProductVariant,
      ProductMedia,
      ProductCategory,
      UploadMedia,
      OrderItem,
      ClientWishlistItem,
      ProductExport,
    ]),
  ],
  controllers: [ProductsController],
  providers: [
    CloudflareImagesService,
    ProductMediaService,
    UploadMediaService,
    ProductsService,
    ProductExportsService,
    ProductExportWorkerService,
  ],
  exports: [
    CloudflareImagesService,
    ProductMediaService,
    UploadMediaService,
    ProductsService,
    ProductExportsService,
  ],
})
export class ProductsModule {}
