import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConversationGroup } from "../database/entities";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import type { ConversationGroupResponseDto } from "./dto/http/conversation-group-response.dto";
import type { CreateConversationGroupRequestDto } from "./dto/http/create-conversation-group-request.dto";
import type { UpdateConversationGroupRequestDto } from "./dto/http/update-conversation-group-request.dto";

@Injectable()
export class ConversationGroupsService {
  constructor(
    @InjectRepository(ConversationGroup)
    private readonly groupRepo: Repository<ConversationGroup>,
    private readonly workspaceContext: WorkspaceAccessContextService,
  ) {}

  async listForOwner(
    ownerId: number,
  ): Promise<{ items: ConversationGroupResponseDto[] }> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const rows = await this.groupRepo.find({
      where: { workspaceId },
      order: { sortOrder: "ASC", id: "ASC" },
    });
    return { items: rows.map((r) => this.toDto(r)) };
  }

  async getOneForOwner(
    ownerId: number,
    groupId: number,
  ): Promise<ConversationGroupResponseDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const row = await this.groupRepo.findOne({
      where: { id: groupId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException("Conversation group not found");
    }
    return this.toDto(row);
  }

  async createForOwner(
    ownerId: number,
    dto: CreateConversationGroupRequestDto,
  ): Promise<ConversationGroupResponseDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const sortOrder = dto.sort_order ?? 0;
    const row = this.groupRepo.create({
      workspaceId,
      name: dto.name.trim(),
      description: dto.description?.trim() ? dto.description.trim() : null,
      color: dto.color?.trim() ? dto.color.trim() : null,
      createdById: ownerId,
      sortOrder,
    });
    await this.groupRepo.save(row);
    return this.toDto(row);
  }

  async updateForOwner(
    ownerId: number,
    groupId: number,
    dto: UpdateConversationGroupRequestDto,
  ): Promise<ConversationGroupResponseDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const row = await this.groupRepo.findOne({
      where: { id: groupId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException("Conversation group not found");
    }
    if (dto.name !== undefined) row.name = dto.name.trim();
    if (dto.description !== undefined) {
      row.description =
        dto.description === null || dto.description.trim() === ""
          ? null
          : dto.description.trim();
    }
    if (dto.color !== undefined) {
      row.color =
        dto.color === null || dto.color.trim() === "" ? null : dto.color.trim();
    }
    if (dto.sort_order !== undefined) row.sortOrder = dto.sort_order;
    await this.groupRepo.save(row);
    return this.toDto(row);
  }

  async deleteForOwner(ownerId: number, groupId: number): Promise<void> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const res = await this.groupRepo.delete({ id: groupId, workspaceId });
    if (res.affected === 0) {
      throw new NotFoundException("Conversation group not found");
    }
  }

  private toDto(row: ConversationGroup): ConversationGroupResponseDto {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      description: row.description,
      color: row.color,
      createdAt: row.createdAt,
      createdById: row.createdById,
      sortOrder: row.sortOrder,
    };
  }
}
