import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Company, Workspace } from "../database/entities";
import type { UpdateWorkspaceSettingsDto } from "./dto/update-workspace-settings.dto";
import type { WorkspaceSettingsResponseDto } from "./dto/workspace-settings-response.dto";

@Injectable()
export class WorkspaceSettingsService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
  ) {}

  async getForOwner(ownerId: number): Promise<WorkspaceSettingsResponseDto> {
    const ws = await this.requireWorkspaceForOwner(ownerId);
    return this.toDto(ws);
  }

  async updateForOwner(
    ownerId: number,
    dto: UpdateWorkspaceSettingsDto,
  ): Promise<WorkspaceSettingsResponseDto> {
    const ws = await this.requireWorkspaceForOwner(ownerId);
    const code = dto.currency.slice(0, 8);
    if (!code) {
      throw new BadRequestException("currency must not be empty");
    }
    ws.defaultCurrency = code;
    await this.workspaceRepo.save(ws);
    return this.toDto(ws);
  }

  /** Default product/catalog currency when the client omits `currency`. */
  async getDefaultCurrencyForOwner(ownerId: number): Promise<string> {
    const ws = await this.requireWorkspaceForOwner(ownerId);
    return (ws.defaultCurrency?.trim() || "UAH").slice(0, 8);
  }

  private toDto(ws: Workspace): WorkspaceSettingsResponseDto {
    return {
      workspaceId: ws.id,
      currency: (ws.defaultCurrency?.trim() || "UAH").slice(0, 8),
    };
  }

  private async requireWorkspaceForOwner(ownerId: number): Promise<Workspace> {
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain a numeric owner id",
      );
    }
    const company = await this.companyRepo.findOne({
      where: { ownerId },
      order: { id: "DESC" },
    });
    if (!company) {
      throw new NotFoundException(
        "Integration not found for current user; create a workspace first",
      );
    }
    const ws = await this.workspaceRepo.findOne({
      where: { id: company.workspaceId },
    });
    if (!ws || ws.ownerId !== ownerId) {
      throw new NotFoundException("Workspace not found for current user");
    }
    return ws;
  }
}
