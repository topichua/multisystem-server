import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CategoriesModule } from "../categories/categories.module";
import { InstagramIntegration } from "../database/entities";
import { VariantCustomFieldsModule } from "../variant-custom-fields/variant-custom-fields.module";
import { InstagramController } from "./instagram.controller";
import { InstagramPostAiExtractionService } from "./instagram-post-ai-extraction.service";
import { InstagramProductAiService } from "./instagram-product-ai.service";
import { InstagramService } from "./instagram.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([InstagramIntegration]),
    CategoriesModule,
    VariantCustomFieldsModule,
  ],
  controllers: [InstagramController],
  providers: [
    InstagramService,
    InstagramProductAiService,
    InstagramPostAiExtractionService,
  ],
})
export class InstagramModule {}
