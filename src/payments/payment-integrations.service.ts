import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  PaymentIntegration,
  PaymentIntegrationStatus,
  PaymentProvider,
} from "../database/entities";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { WorkspacePermissionsService } from "../workspace-access/workspace-permissions.service";
import { hasBooleanPermission } from "../workspace-access/permissions/permissions-resolver";
import { PaymentProviderFactory } from "./providers/payment-provider.factory";
import type { ConnectMonobankIntegrationDto } from "./dto/connect-monobank-integration.dto";
import type { PaymentIntegrationResponseDto } from "./dto/payment-integration-response.dto";
import type { PaymentIntegrationsListResponseDto } from "./dto/payment-integrations-list-response.dto";
import type { UpdateMonobankIntegrationDto } from "./dto/update-monobank-integration.dto";

const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  [PaymentProvider.monobank]: "Monobank Acquiring",
};

@Injectable()
export class PaymentIntegrationsService {
  constructor(
    @InjectRepository(PaymentIntegration)
    private readonly repo: Repository<PaymentIntegration>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly permissions: WorkspacePermissionsService,
    private readonly providerFactory: PaymentProviderFactory,
  ) {}

  async listForUser(
    userId: number,
    appRole?: string,
  ): Promise<PaymentIntegrationsListResponseDto> {
    await this.requireViewPermission(userId, appRole);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(userId, appRole);
    const rows = await this.repo.find({
      where: { workspaceId: workspace.id },
      order: { provider: "ASC" },
    });
    const connected = rows.filter(
      (r) => r.status === PaymentIntegrationStatus.connected,
    );
    return {
      availableProviders: Object.values(PaymentProvider).map((provider) => ({
        provider,
        label: PROVIDER_LABELS[provider],
        connected: connected.some((r) => r.provider === provider),
      })),
      integrations: rows.map((row) => this.toDto(row)),
    };
  }

  async connectMonobank(
    userId: number,
    dto: ConnectMonobankIntegrationDto,
    appRole?: string,
  ): Promise<PaymentIntegrationResponseDto> {
    await this.requireManagePermission(userId, appRole);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(userId, appRole);
    const merchantToken = dto.merchantToken.trim();
    if (!merchantToken) {
      throw new BadRequestException("merchantToken is required");
    }

    const provider = this.providerFactory.getProvider({
      provider: PaymentProvider.monobank,
      data: { merchantToken },
    });
    const validation = await provider.validateCredentials();
    if (!validation.valid) {
      throw new BadRequestException(
        validation.userMessage ??
          "Не вдалося підключити Monobank. Перевірте merchant token.",
      );
    }

    const displayName =
      dto.displayName?.trim() || PROVIDER_LABELS[PaymentProvider.monobank];
    const now = new Date();
    const existing = await this.repo.findOne({
      where: {
        workspaceId: workspace.id,
        provider: PaymentProvider.monobank,
      },
    });

    if (existing) {
      if (existing.status === PaymentIntegrationStatus.connected) {
        throw new BadRequestException(
          "Monobank integration is already connected. Use PATCH /workspace/payment-integrations/monobank/:integrationId to update credentials.",
        );
      }
      throw new BadRequestException(
        "Monobank integration already exists but is disconnected. Use PATCH /workspace/payment-integrations/monobank/:integrationId to reconnect.",
      );
    }

    const row = this.repo.create({
      workspaceId: workspace.id,
      provider: PaymentProvider.monobank,
      displayName,
      status: PaymentIntegrationStatus.connected,
      credentialsEncrypted:
        this.providerFactory.encryptMonobankCredentials(merchantToken),
      lastConnectionCheckAt: now,
      lastError: null,
      isDefault: false,
    });

    const saved = await this.repo.save(row);
    await this.ensureDefaultIntegration(workspace.id);
    const refreshed = await this.repo.findOne({ where: { id: saved.id } });
    return this.toDto(refreshed ?? saved);
  }

  async updateMonobank(
    userId: number,
    integrationId: number,
    dto: UpdateMonobankIntegrationDto,
    appRole?: string,
  ): Promise<PaymentIntegrationResponseDto> {
    await this.requireManagePermission(userId, appRole);
    const row = await this.requireOwnedIntegration(userId, integrationId, appRole);

    if (dto.displayName !== undefined) {
      const name = dto.displayName.trim();
      if (!name) {
        throw new BadRequestException("displayName must not be empty");
      }
      row.displayName = name;
    }

    if (dto.merchantToken !== undefined) {
      const merchantToken = dto.merchantToken.trim();
      if (!merchantToken) {
        throw new BadRequestException("merchantToken must not be empty");
      }
      const provider = this.providerFactory.getProvider({
        provider: PaymentProvider.monobank,
        data: { merchantToken },
      });
      const validation = await provider.validateCredentials();
      if (!validation.valid) {
        throw new BadRequestException(
          validation.userMessage ??
            "Не вдалося оновити credentials Monobank.",
        );
      }
      row.credentialsEncrypted =
        this.providerFactory.encryptMonobankCredentials(merchantToken);
      row.status = PaymentIntegrationStatus.connected;
      row.lastConnectionCheckAt = new Date();
      row.lastError = null;
    }

    const saved = await this.repo.save(row);
    return this.toDto(saved);
  }

  async checkConnection(
    userId: number,
    integrationId: number,
    appRole?: string,
  ): Promise<PaymentIntegrationResponseDto> {
    await this.requireViewPermission(userId, appRole);
    const row = await this.requireOwnedIntegration(userId, integrationId, appRole);
    if (row.status === PaymentIntegrationStatus.disconnected) {
      throw new BadRequestException("Integration is disconnected");
    }

    try {
      const provider = this.resolveProvider(row);
      const validation = await provider.validateCredentials();
      if (!validation.valid) {
        row.status = PaymentIntegrationStatus.error;
        row.lastError =
          validation.userMessage ?? "Connection check failed";
      } else {
        row.status = PaymentIntegrationStatus.connected;
        row.lastError = null;
      }
      row.lastConnectionCheckAt = new Date();
    } catch (error) {
      row.status = PaymentIntegrationStatus.error;
      row.lastError =
        error instanceof BadRequestException
          ? (error.message as string)
          : "Connection check failed";
      row.lastConnectionCheckAt = new Date();
    }

    const saved = await this.repo.save(row);
    if (saved.status === PaymentIntegrationStatus.error) {
      throw new BadRequestException(
        saved.lastError ?? "Connection check failed",
      );
    }
    return this.toDto(saved);
  }

  async setDefault(
    userId: number,
    integrationId: number,
    appRole?: string,
  ): Promise<PaymentIntegrationResponseDto> {
    await this.requireManagePermission(userId, appRole);
    const row = await this.requireOwnedIntegration(userId, integrationId, appRole);
    if (row.status !== PaymentIntegrationStatus.connected) {
      throw new BadRequestException("Only connected integrations can be default");
    }

    await this.repo.update(
      { workspaceId: row.workspaceId, isDefault: true },
      { isDefault: false },
    );
    row.isDefault = true;
    const saved = await this.repo.save(row);
    return this.toDto(saved);
  }

  async disconnect(
    userId: number,
    integrationId: number,
    appRole?: string,
  ): Promise<PaymentIntegrationResponseDto> {
    await this.requireManagePermission(userId, appRole);
    const row = await this.requireOwnedIntegration(userId, integrationId, appRole);
    row.status = PaymentIntegrationStatus.disconnected;
    row.isDefault = false;
    row.lastError = null;
    const saved = await this.repo.save(row);
    await this.ensureDefaultIntegration(row.workspaceId);
    return this.toDto(saved);
  }

  async getIntegrationById(
    workspaceId: number,
    integrationId: number,
  ): Promise<PaymentIntegration> {
    const row = await this.repo.findOne({
      where: { id: integrationId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException("Payment integration not found");
    }
    return row;
  }

  async requireConnectedIntegration(
    workspaceId: number,
    integrationId?: number,
  ): Promise<PaymentIntegration> {
    if (integrationId != null) {
      const row = await this.repo.findOne({
        where: { id: integrationId, workspaceId },
      });
      if (!row) {
        throw new NotFoundException("Payment integration not found");
      }
      if (row.status !== PaymentIntegrationStatus.connected) {
        throw new BadRequestException("Payment integration is not connected");
      }
      if (!row.credentialsEncrypted) {
        throw new BadRequestException("Payment integration has no credentials");
      }
      return row;
    }

    const defaultRow = await this.repo.findOne({
      where: {
        workspaceId,
        status: PaymentIntegrationStatus.connected,
        isDefault: true,
      },
    });
    if (defaultRow?.credentialsEncrypted) {
      return defaultRow;
    }

    const connected = await this.repo.find({
      where: { workspaceId, status: PaymentIntegrationStatus.connected },
      order: { id: "ASC" },
    });
    const withCredentials = connected.filter((r) => r.credentialsEncrypted);
    if (withCredentials.length === 1) {
      return withCredentials[0];
    }
    if (withCredentials.length === 0) {
      throw new BadRequestException("No connected payment integration");
    }
    throw new BadRequestException(
      "Multiple payment integrations connected — specify integrationId",
    );
  }

  private async ensureDefaultIntegration(workspaceId: number): Promise<void> {
    const connected = await this.repo.find({
      where: { workspaceId, status: PaymentIntegrationStatus.connected },
      order: { id: "ASC" },
    });
    if (connected.length === 0) {
      return;
    }
    const hasDefault = connected.some((r) => r.isDefault);
    if (!hasDefault && connected.length === 1) {
      connected[0].isDefault = true;
      await this.repo.save(connected[0]);
    }
  }

  private resolveProvider(row: PaymentIntegration) {
    if (!row.credentialsEncrypted) {
      throw new BadRequestException("Integration has no credentials");
    }
    const credentials = this.providerFactory.decryptCredentials(
      row.provider,
      row.credentialsEncrypted,
    );
    return this.providerFactory.getProvider(credentials);
  }

  private async requireOwnedIntegration(
    userId: number,
    integrationId: number,
    appRole?: string,
  ): Promise<PaymentIntegration> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(userId, appRole);
    const row = await this.repo.findOne({
      where: { id: integrationId, workspaceId: workspace.id },
    });
    if (!row) {
      throw new NotFoundException("Payment integration not found");
    }
    return row;
  }

  private async requireViewPermission(
    userId: number,
    appRole?: string,
  ): Promise<void> {
    const resolved = await this.permissions.getResolvedForUser(userId, appRole);
    if (
      !hasBooleanPermission(resolved, "payments.integrations.view") &&
      !hasBooleanPermission(resolved, "payments.integrations.manage")
    ) {
      throw new ForbiddenException("Missing payments.integrations.view permission");
    }
  }

  private async requireManagePermission(
    userId: number,
    appRole?: string,
  ): Promise<void> {
    const resolved = await this.permissions.getResolvedForUser(userId, appRole);
    if (!hasBooleanPermission(resolved, "payments.integrations.manage")) {
      throw new ForbiddenException(
        "Missing payments.integrations.manage permission",
      );
    }
  }

  private toDto(row: PaymentIntegration): PaymentIntegrationResponseDto {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      provider: row.provider,
      displayName: row.displayName,
      status: row.status,
      isDefault: row.isDefault,
      credentialsMasked: this.providerFactory.maskCredentials(
        row.provider,
        row.credentialsEncrypted,
      ),
      lastConnectionCheckAt: row.lastConnectionCheckAt?.toISOString() ?? null,
      lastError: row.lastError,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
