import { Injectable } from "@nestjs/common";
import type { WorkspaceExportHandler } from "./workspace-export-handler";

@Injectable()
export class ExportHandlerRegistry {
  private readonly handlers = new Map<string, WorkspaceExportHandler>();

  register(handler: WorkspaceExportHandler): void {
    this.handlers.set(handler.type, handler);
  }

  get(type: string): WorkspaceExportHandler | undefined {
    return this.handlers.get(type);
  }

  types(): string[] {
    return [...this.handlers.keys()];
  }
}
