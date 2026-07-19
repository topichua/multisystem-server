import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  ProductVariantCustomFieldValue,
  WorkspaceVariantCustomField,
  WorkspaceVariantCustomFieldOption,
} from "../database/entities";
import { VariantCustomFieldsController } from "./variant-custom-fields.controller";
import { VariantCustomFieldsService } from "./variant-custom-fields.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkspaceVariantCustomField,
      WorkspaceVariantCustomFieldOption,
      ProductVariantCustomFieldValue,
    ]),
  ],
  controllers: [VariantCustomFieldsController],
  providers: [VariantCustomFieldsService],
  exports: [VariantCustomFieldsService],
})
export class VariantCustomFieldsModule {}
