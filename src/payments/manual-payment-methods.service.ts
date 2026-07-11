import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ManualPaymentMethod } from "../database/entities";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { WorkspacePermissionsService } from "../workspace-access/workspace-permissions.service";
import { hasBooleanPermission } from "../workspace-access/permissions/permissions-resolver";
import {
  formatManualPaymentMethodValueForDisplay,
  normalizeManualPaymentMethodValue,
} from "./logic/manual-payment-method.validation";
import type {
  CreateManualPaymentMethodDto,
  ManualPaymentMethodResponseDto,
  ManualPaymentMethodsListResponseDto,
  UpdateManualPaymentMethodDto,
} from "./dto/manual-payment-method.dto";

@Injectable()
export class ManualPaymentMethodsService {
  constructor(
    @InjectRepository(ManualPaymentMethod)
    private readonly repo: Repository<ManualPaymentMethod>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly permissions: WorkspacePermissionsService,
  ) {}

  async listForUser(
    userId: number,
    appRole?: string,
  ): Promise<ManualPaymentMethodsListResponseDto> {
    await this.requireViewPermission(userId, appRole);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(userId, appRole);
    const rows = await this.repo.find({
      where: { workspaceId: workspace.id },
      order: { createdAt: "ASC" },
    });
    return {
      workspaceId: workspace.id,
      items: rows.map((row) => this.toDto(row)),
    };
  }

  async createForUser(
    userId: number,
    dto: CreateManualPaymentMethodDto,
    appRole?: string,
  ): Promise<ManualPaymentMethodResponseDto> {
    await this.requireManagePermission(userId, appRole);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(userId, appRole);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("name is required");
    }
    const value = normalizeManualPaymentMethodValue(dto.type, dto.value);
    const row = this.repo.create({
      workspaceId: workspace.id,
      name,
      type: dto.type,
      value,
    });
    const saved = await this.repo.save(row);
    return this.toDto(saved);
  }

  async updateForUser(
    userId: number,
    id: number,
    dto: UpdateManualPaymentMethodDto,
    appRole?: string,
  ): Promise<ManualPaymentMethodResponseDto> {
    await this.requireManagePermission(userId, appRole);
    const row = await this.requireOwnedMethod(userId, id, appRole);
    if (dto.name === undefined && dto.type === undefined && dto.value === undefined) {
      throw new BadRequestException("At least one field is required");
    }
    const previousType = row.type;
    const nextType = dto.type ?? row.type;
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException("name must not be empty");
      }
      row.name = name;
    }
    if (dto.type !== undefined) {
      row.type = dto.type;
    }
    if (dto.value !== undefined) {
      row.value = normalizeManualPaymentMethodValue(nextType, dto.value);
    } else if (dto.type !== undefined && dto.type !== previousType) {
      row.value = normalizeManualPaymentMethodValue(nextType, row.value);
    }
    const saved = await this.repo.save(row);
    return this.toDto(saved);
  }

  async deleteForUser(
    userId: number,
    id: number,
    appRole?: string,
  ): Promise<void> {
    await this.requireManagePermission(userId, appRole);
    const row = await this.requireOwnedMethod(userId, id, appRole);
    await this.repo.remove(row);
  }

  async requireOwnedMethodForWorkspace(
    workspaceId: number,
    methodId: number,
  ): Promise<ManualPaymentMethod> {
    const row = await this.repo.findOne({
      where: { id: methodId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException("Manual payment method not found");
    }
    return row;
  }

  toDto(row: ManualPaymentMethod): ManualPaymentMethodResponseDto {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      type: row.type,
      value: row.value,
      displayValue: formatManualPaymentMethodValueForDisplay(row.type, row.value),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async requireOwnedMethod(
    userId: number,
    id: number,
    appRole?: string,
  ): Promise<ManualPaymentMethod> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(userId, appRole);
    const row = await this.repo.findOne({
      where: { id, workspaceId: workspace.id },
    });
    if (!row) {
      throw new NotFoundException("Manual payment method not found");
    }
    return row;
  }

  private async requireViewPermission(
    userId: number,
    appRole?: string,
  ): Promise<void> {
    const resolved = await this.permissions.getResolvedForUser(userId, appRole);
    if (
      !hasBooleanPermission(resolved, "payments.manual_methods.view") &&
      !hasBooleanPermission(resolved, "payments.manual_methods.manage")
    ) {
      throw new ForbiddenException(
        "Missing payments.manual_methods.view permission",
      );
    }
  }

  private async requireManagePermission(
    userId: number,
    appRole?: string,
  ): Promise<void> {
    const resolved = await this.permissions.getResolvedForUser(userId, appRole);
    if (!hasBooleanPermission(resolved, "payments.manual_methods.manage")) {
      throw new ForbiddenException(
        "Missing payments.manual_methods.manage permission",
      );
    }
  }
}
