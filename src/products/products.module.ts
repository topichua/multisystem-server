import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Company,
  Product,
  ProductCategory,
  ProductMedia,
  ProductSourceReference,
  ProductVariant,
} from "../database/entities";
import { ProductMediaService } from "./product-media.service";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      Product,
      ProductVariant,
      ProductMedia,
      ProductSourceReference,
      ProductCategory,
    ]),
  ],
  controllers: [ProductsController],
  providers: [ProductMediaService, ProductsService],
  exports: [ProductMediaService, ProductsService],
})
export class ProductsModule {}
