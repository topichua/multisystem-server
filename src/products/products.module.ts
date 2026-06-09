import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Product,
  ProductCategory,
  ProductMedia,
  ProductVariant,
  UploadMedia,
  OrderItem,
} from "../database/entities";
import { CloudflareImagesService } from "./cloudflare-images.service";
import { VariantCustomFieldsModule } from "../variant-custom-fields/variant-custom-fields.module";
import { WorkspaceSettingsModule } from "../workspace-settings/workspace-settings.module";
import { ProductMediaService } from "./product-media.service";
import { UploadMediaService } from "./upload-media.service";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

@Module({
  imports: [
    WorkspaceSettingsModule,
    VariantCustomFieldsModule,
    TypeOrmModule.forFeature([
      Product,
      ProductVariant,
      ProductMedia,
      ProductCategory,
      UploadMedia,
      OrderItem,
    ]),
  ],
  controllers: [ProductsController],
  providers: [
    CloudflareImagesService,
    ProductMediaService,
    UploadMediaService,
    ProductsService,
  ],
  exports: [
    CloudflareImagesService,
    ProductMediaService,
    UploadMediaService,
    ProductsService,
  ],
})
export class ProductsModule {}
