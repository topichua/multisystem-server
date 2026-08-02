import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CategoriesModule } from "../categories/categories.module";
import {
  InstagramIntegration,
  InstagramSynchronization,
  InstagramUser,
} from "../database/entities";
import { ProductInstagramReferencesModule } from "../product-instagram-references/product-instagram-references.module";
import { VariantCustomFieldsModule } from "../variant-custom-fields/variant-custom-fields.module";
import { InstagramIntegrationProfileService } from "./instagram-integration-profile.service";
import { InstagramSynchronizationsService } from "./instagram-synchronizations.service";
import { InstagramUsersService } from "./instagram-users.service";
import { InstagramController } from "./instagram.controller";
import { InstagramPostAiExtractionService } from "./instagram-post-ai-extraction.service";
import { InstagramProductAiService } from "./instagram-product-ai.service";
import { InstagramService } from "./instagram.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstagramIntegration,
      InstagramSynchronization,
      InstagramUser,
    ]),
    CategoriesModule,
    ProductInstagramReferencesModule,
    VariantCustomFieldsModule,
  ],
  controllers: [InstagramController],
  providers: [
    InstagramService,
    InstagramIntegrationProfileService,
    InstagramUsersService,
    InstagramProductAiService,
    InstagramPostAiExtractionService,
    InstagramSynchronizationsService,
  ],
  exports: [
    InstagramIntegrationProfileService,
    InstagramUsersService,
    InstagramSynchronizationsService,
  ],
})
export class InstagramModule {}
