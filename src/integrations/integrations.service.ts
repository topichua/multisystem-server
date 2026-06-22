import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Not, IsNull, QueryFailedError, Repository } from "typeorm";
import { FacebookOAuthService } from "../auth/facebook-oauth.service";
import {
  InstagramIntegration,
  TelegramIntegrationStatus,
} from "../database/entities";
import type { TelegramIntegration } from "../database/entities";
import { TelegramIntegrationsService } from "../telegram-integrations/telegram-integrations.service";
import { NovaPoshtaIntegrationsService } from "../novaposhta-integrations/novaposhta-integrations.service";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { WorkspaceRoleIntegrationGrantsService } from "../workspace-access/workspace-role-integration-grants.service";
import {
  INTEGRATION_TYPES,
  type IntegrationType,
} from "./integration-type";
import type { CreateIntegrationRequestDto } from "./dto/http/create-integration-request.dto";
import type { CreateIntegrationResponseDto } from "./dto/http/create-integration-response.dto";
import type { IntegrationListItemDto } from "./dto/http/integration-list-item.dto";
import type { IntegrationsListResponseDto } from "./dto/http/integrations-list-response.dto";

type InstagramBusinessProfileNode = {
  id?: string;
  name?: string;
  username?: string;
  profile_picture_url?: string;
  has_profile_pic?: boolean;
};

type InstagramErrorResponse = {
  error?: {
    message?: string;
    code?: number;
  };
};

@Injectable()
export class IntegrationsService {
  private readonly log = new Logger(IntegrationsService.name);

  constructor(
    @InjectRepository(InstagramIntegration)
    private readonly instagramIntegrationRepo: Repository<InstagramIntegration>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly facebookOAuth: FacebookOAuthService,
    private readonly telegramIntegrations: TelegramIntegrationsService,
    private readonly novaPoshtaIntegrations: NovaPoshtaIntegrationsService,
    private readonly roleIntegrationGrants: WorkspaceRoleIntegrationGrantsService,
  ) {}

  async startForOwner(
    ownerId: number,
    dto: CreateIntegrationRequestDto,
  ): Promise<CreateIntegrationResponseDto> {
    const type = dto.integration_type;
    if (type !== "instagram") {
      throw new BadRequestException(
        `integration_type "${type}" is not supported on this endpoint`,
      );
    }

    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const existing = await this.instagramIntegrationRepo.findOne({
      where: {
        workspaceId: workspace.id,
        ownerId: workspace.ownerId,
        accessToken: Not(IsNull()),
      },
      order: { id: "DESC" },
    });
    const url = await this.facebookOAuth.buildAuthorizeUrlForOwnerId(
      ownerId,
      workspace.id,
    );

    if (existing) {
      const name =
        existing.facebookPageName?.trim() ||
        existing.name?.trim() ||
        `Instagram #${existing.id}`;
      const connectedAt = existing.tokenConnectedAt;
      return {
        type: "instagram",
        id: existing.id,
        name,
        url,
        ...(connectedAt != null && !Number.isNaN(connectedAt.getTime())
          ? { connectedAt: connectedAt.toISOString() }
          : {}),
      };
    }

    return {
      type: "instagram",
      name: workspace.name,
      url,
    };
  }

  async listForOwner(
    ownerId: number,
    workspaceIdParam?: number,
  ): Promise<IntegrationsListResponseDto> {
    const workspaceId = await this.resolveWorkspaceIdForOwner(
      ownerId,
      workspaceIdParam,
    );

    const instagramRows = await this.instagramIntegrationRepo.find({
      where: { workspaceId, accessToken: Not(IsNull()) },
      order: { id: "ASC" },
    });

    const items: IntegrationListItemDto[] = await Promise.all(
      instagramRows.map((row) => this.mapInstagramRow(row)),
    );

    const telegramRows =
      await this.telegramIntegrations.findActiveByWorkspace(workspaceId);
    for (const tg of telegramRows) {
      items.push(this.mapTelegramRow(tg));
    }

    const novaPoshta = await this.novaPoshtaIntegrations.findByWorkspace(
      workspaceId,
    );
    if (novaPoshta) {
      items.push(this.novaPoshtaIntegrations.mapToIntegrationListItem(novaPoshta));
    }

    return { workspaceId, items };
  }

  async deleteForOwner(
    ownerId: number,
    type: string,
    id: number,
  ): Promise<void> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException("id must be a positive integer");
    }
    const integrationType = this.parseIntegrationType(type);

    switch (integrationType) {
      case "instagram":
        await this.deleteInstagramForOwner(ownerId, id);
        return;
      case "telegram":
        await this.roleIntegrationGrants.removeForIntegration("telegram", id);
        await this.telegramIntegrations.deleteForOwner(ownerId, id);
        return;
      case "novaposhta":
        await this.novaPoshtaIntegrations.deleteForOwner(ownerId, id);
        return;
    }
  }

  private parseIntegrationType(raw: string): IntegrationType {
    const type = raw.trim().toLowerCase();
    if (!(INTEGRATION_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException(
        `type must be one of: ${INTEGRATION_TYPES.join(", ")}`,
      );
    }
    return type as IntegrationType;
  }

  private async deleteInstagramForOwner(
    ownerId: number,
    id: number,
  ): Promise<void> {
    const row = await this.instagramIntegrationRepo.findOne({ where: { id } });
    if (!row || row.ownerId !== ownerId) {
      throw new NotFoundException("Instagram integration not found");
    }

    await this.workspaceContext.requireWorkspaceOwner(
      ownerId,
      row.workspaceId,
    );

    await this.facebookOAuth.revokeIntegrationPermissionsBestEffort(row);
    await this.roleIntegrationGrants.removeForIntegration("instagram", id);

    try {
      await this.instagramIntegrationRepo.remove(row);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as QueryFailedError & { driverError?: { code?: string } })
          .driverError?.code === "23503"
      ) {
        throw new ConflictException(
          "Cannot delete Instagram integration while other records still reference it",
        );
      }
      throw err;
    }
  }

  private mapTelegramRow(row: TelegramIntegration): IntegrationListItemDto {
    const mapped = this.telegramIntegrations.mapToIntegrationListItem(row);
    return {
      type: mapped.type,
      id: mapped.id,
      name: mapped.name,
      ...(mapped.connectedAt ? { connectedAt: mapped.connectedAt } : {}),
      ...(mapped.status !== TelegramIntegrationStatus.ACTIVE
        ? { status: mapped.status }
        : {}),
    };
  }

  private async mapInstagramRow(
    row: InstagramIntegration,
  ): Promise<IntegrationListItemDto> {
    const fallbackName =
      row.facebookPageName?.trim() ||
      row.name?.trim() ||
      `Instagram #${row.id}`;
    const connectedAt = row.tokenConnectedAt;
    const businessAccountId = row.instagramAccountId?.trim();

    let name = fallbackName;
    let userName: string | undefined;
    let avatar: string | null = null;

    if (businessAccountId) {
      const profile = await this.fetchInstagramBusinessProfile(
        row,
        businessAccountId,
      );
      if (profile) {
        name = profile.name?.trim() || fallbackName;
        const username = profile.username?.trim();
        if (username) {
          userName = username;
        }
        avatar = profile.profile_picture_url?.trim() || null;
      }
    }

    return {
      type: "instagram",
      name,
      id: row.id,
      ...(businessAccountId ? { businessAccountId } : {}),
      ...(userName ? { userName } : {}),
      avatar,
      ...(connectedAt != null && !Number.isNaN(connectedAt.getTime())
        ? { connectedAt: connectedAt.toISOString() }
        : {}),
    };
  }

  private resolveInstagramProfileAccessToken(
    row: InstagramIntegration,
  ): string | null {
    // IG User `profile_picture_url` requires a User access token, not Page token.
    return row.userAccessToken?.trim() || row.accessToken?.trim() || null;
  }

  private async fetchInstagramBusinessProfile(
    row: InstagramIntegration,
    businessAccountId: string,
  ): Promise<InstagramBusinessProfileNode | null> {
    const accessToken = this.resolveInstagramProfileAccessToken(row);
    if (!accessToken) {
      return null;
    }

    try {
      const url = new URL(
        `https://graph.facebook.com/v25.0/${encodeURIComponent(businessAccountId)}`,
      );
      url.searchParams.set(
        "fields",
        "id,name,username,profile_picture_url,has_profile_pic",
      );
      url.searchParams.set("access_token", accessToken);
      const profile =
        await this.instagramGraphFetch<InstagramBusinessProfileNode>(url);
      return profile;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(
        `Instagram profile fetch failed integrationId=${row.id} businessAccountId=${businessAccountId}: ${err}`,
      );
      return null;
    }
  }

  private async instagramGraphFetch<T>(url: URL): Promise<T> {
    const response = await fetch(url.toString());
    const bodyText = await response.text();
    let body: T | InstagramErrorResponse = {} as T;
    if (bodyText) {
      try {
        body = JSON.parse(bodyText) as T | InstagramErrorResponse;
      } catch {
        throw new BadGatewayException(
          "Instagram Graph API returned invalid JSON",
        );
      }
    }

    if (!response.ok) {
      const err = body as InstagramErrorResponse;
      const msg =
        err?.error?.message ??
        `Instagram Graph API request failed with status ${response.status}`;
      throw new BadGatewayException(msg);
    }

    return body as T;
  }

  private async resolveWorkspaceIdForOwner(
    ownerId: number,
    workspaceIdParam?: number,
  ): Promise<number> {
    return this.workspaceContext.resolveWorkspaceIdForOwner(
      ownerId,
      workspaceIdParam,
    );
  }
}
