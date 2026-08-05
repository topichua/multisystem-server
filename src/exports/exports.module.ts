import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WorkspaceExportJob } from "../database/entities/workspace-export-job.entity";
import { StorageModule } from "../storage/storage.module";
import { ExportsController } from "./exports.controller";
import { ExportHandlerRegistry } from "./export-handler-registry";
import { WorkspaceExportsService } from "./workspace-exports.service";
import { WorkspaceExportWorkerService } from "./workspace-export-worker.service";

@Module({
  imports: [StorageModule, TypeOrmModule.forFeature([WorkspaceExportJob])],
  controllers: [ExportsController],
  providers: [
    WorkspaceExportsService,
    ExportHandlerRegistry,
    WorkspaceExportWorkerService,
  ],
  exports: [WorkspaceExportsService, ExportHandlerRegistry],
})
export class ExportsModule {}
