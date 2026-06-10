import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Product,
  ProductInstagramReference,
  ProductVariant,
} from "../database/entities";
import { ProductsModule } from "../products/products.module";
import { ProductInstagramReferencesByAccountController } from "./product-instagram-references-by-account.controller";
import { ProductInstagramReferencesController } from "./product-instagram-references.controller";
import { ProductInstagramReferencesService } from "./product-instagram-references.service";

@Module({
  imports: [
    ProductsModule,
    TypeOrmModule.forFeature([
      ProductInstagramReference,
      Product,
      ProductVariant,
    ]),
  ],
  controllers: [
    ProductInstagramReferencesController,
    ProductInstagramReferencesByAccountController,
  ],
  providers: [ProductInstagramReferencesService],
  exports: [ProductInstagramReferencesService],
})
export class ProductInstagramReferencesModule {}
