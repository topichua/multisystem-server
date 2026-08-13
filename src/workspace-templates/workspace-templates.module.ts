import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Client,
  ClientLink,
  Conversation,
  Order,
  OrderDeliveryInfo,
} from "../database/entities";
import { WorkspaceAccessModule } from "../workspace-access/workspace-access.module";
import { WorkspaceTemplate } from "./workspace-template.entity";
import { WorkspaceTemplatesController } from "./workspace-templates.controller";
import { WorkspaceTemplatesService } from "./workspace-templates.service";
import { WorkspaceTemplateRenderService } from "./workspace-template-render.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkspaceTemplate,
      Order,
      OrderDeliveryInfo,
      Conversation,
      Client,
      ClientLink,
    ]),
    WorkspaceAccessModule,
  ],
  controllers: [WorkspaceTemplatesController],
  providers: [WorkspaceTemplatesService, WorkspaceTemplateRenderService],
  exports: [WorkspaceTemplatesService, WorkspaceTemplateRenderService],
})
export class WorkspaceTemplatesModule {}
