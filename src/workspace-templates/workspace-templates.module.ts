import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WorkspaceAccessModule } from "../workspace-access/workspace-access.module";
import { WorkspaceTemplate } from "./workspace-template.entity";
import { WorkspaceTemplatesController } from "./workspace-templates.controller";
import { WorkspaceTemplatesService } from "./workspace-templates.service";

@Module({
  imports: [TypeOrmModule.forFeature([WorkspaceTemplate]), WorkspaceAccessModule],
  controllers: [WorkspaceTemplatesController],
  providers: [WorkspaceTemplatesService],
})
export class WorkspaceTemplatesModule {}
