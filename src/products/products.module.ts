import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  InstagramIntegration,
  Product,
  ProductCategory,
  ProductMedia,
  ProductSourceReference,
  ProductVariant,
} from "../database/entities";
import { CloudflareImagesService } from "./cloudflare-images.service";
import { WorkspaceSettingsModule } from "../workspace-settings/workspace-settings.module";
import { ProductMediaService } from "./product-media.service";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

@Module({
  imports: [
    WorkspaceSettingsModule,
    TypeOrmModule.forFeature([
      InstagramIntegration,
      Product,
      ProductVariant,
      ProductMedia,
      ProductSourceReference,
      ProductCategory,
    ]),
  ],
  controllers: [ProductsController],
  providers: [CloudflareImagesService, ProductMediaService, ProductsService],
  exports: [CloudflareImagesService, ProductMediaService, ProductsService],
})
export class ProductsModule {}
