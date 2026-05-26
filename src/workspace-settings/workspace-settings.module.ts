import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { InstagramIntegration, Workspace } from "../database/entities";
import { WorkspaceSettingsController } from "./workspace-settings.controller";
import { WorkspaceSettingsService } from "./workspace-settings.service";

@Module({
  imports: [TypeOrmModule.forFeature([InstagramIntegration, Workspace])],
  controllers: [WorkspaceSettingsController],
  providers: [WorkspaceSettingsService],
  exports: [WorkspaceSettingsService],
})
export class WorkspaceSettingsModule {}
