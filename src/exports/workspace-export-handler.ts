import type { WorkspaceExportJob } from "../database/entities/workspace-export-job.entity";

/**
 * Per-resource processor registered with the export worker.
 * Add handlers for products, customers, etc. without new workers.
 */
export interface WorkspaceExportHandler {
  readonly type: string;
  process(job: WorkspaceExportJob): Promise<void>;
}

export const WORKSPACE_EXPORT_HANDLERS = Symbol("WORKSPACE_EXPORT_HANDLERS");
