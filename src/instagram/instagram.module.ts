import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CategoriesModule } from "../categories/categories.module";
import { InstagramIntegration } from "../database/entities";
import { ProductsModule } from "../products/products.module";
import { InstagramController } from "./instagram.controller";
import { InstagramProductAiService } from "./instagram-product-ai.service";
import { InstagramService } from "./instagram.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([InstagramIntegration]),
    CategoriesModule,
    ProductsModule,
  ],
  controllers: [InstagramController],
  providers: [InstagramService, InstagramProductAiService],
})
export class InstagramModule {}
