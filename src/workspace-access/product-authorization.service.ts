import { ForbiddenException, Injectable } from "@nestjs/common";
import type { IntegrationType } from "../integrations/integration-type";
import {
  canManageProductReferences,
  hasBooleanPermission,
} from "./permissions/permissions-resolver";
import type { PermissionKey } from "./permissions/permission-keys";
import { WorkspacePermissionsService } from "./workspace-permissions.service";

@Injectable()
export class ProductAuthorizationService {
  constructor(private readonly permissions: WorkspacePermissionsService) {}

  async requireEnabled(
    userId: number,
    appRole?: string,
    workspaceId?: number,
  ): Promise<void> {
    await this.requireKey(userId, "products.enabled", appRole, workspaceId);
  }

  async requireRead(
    userId: number,
    appRole?: string,
    workspaceId?: number,
  ): Promise<void> {
    await this.requireKey(userId, "products.read", appRole, workspaceId);
  }

  async requireWrite(
    userId: number,
    appRole?: string,
    workspaceId?: number,
  ): Promise<void> {
    await this.requireKey(userId, "products.write", appRole, workspaceId);
  }

  async requireCharacteristicsManage(
    userId: number,
    appRole?: string,
    workspaceId?: number,
  ): Promise<void> {
    await this.requireKey(
      userId,
      "products.custom_fields",
      appRole,
      workspaceId,
    );
  }

  async requireAiImport(
    userId: number,
    appRole?: string,
    workspaceId?: number,
  ): Promise<void> {
    await this.requireKey(userId, "products.ai_import", appRole, workspaceId);
  }

  async requireCategoryManage(
    userId: number,
    appRole?: string,
    workspaceId?: number,
  ): Promise<void> {
    await this.requireKey(userId, "products.category", appRole, workspaceId);
  }

  async requireInventoryView(
    userId: number,
    appRole?: string,
    workspaceId?: number,
  ): Promise<void> {
    await this.requireKey(
      userId,
      "products.inventory.view",
      appRole,
      workspaceId,
    );
  }

  async requireInventoryManage(
    userId: number,
    appRole?: string,
    workspaceId?: number,
  ): Promise<void> {
    await this.requireKey(
      userId,
      "products.inventory.manage",
      appRole,
      workspaceId,
    );
  }

  async requireReferencesManage(
    userId: number,
    appRole?: string,
    workspaceId?: number,
  ): Promise<void> {
    await this.requireKey(
      userId,
      "products.references.manage",
      appRole,
      workspaceId,
    );
  }

  async requireReferenceChannelManage(
    userId: number,
    integrationType: IntegrationType,
    integrationId: number,
    appRole?: string,
    workspaceId?: number,
  ): Promise<void> {
    const resolved = await this.permissions.getResolvedForUser(
      userId,
      appRole,
      workspaceId,
    );
    if (
      !canManageProductReferences(resolved, integrationType, integrationId)
    ) {
      throw new ForbiddenException(
        `Missing permission: products.references.manage for ${integrationType}:${integrationId}`,
      );
    }
  }

  private async requireKey(
    userId: number,
    key: PermissionKey,
    appRole?: string,
    workspaceId?: number,
  ): Promise<void> {
    const resolved = await this.permissions.getResolvedForUser(
      userId,
      appRole,
      workspaceId,
    );
    if (!hasBooleanPermission(resolved, key)) {
      throw new ForbiddenException(`Missing permission: ${key}`);
    }
  }
}
