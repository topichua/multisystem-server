import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  CONVERSATION_GROUP_SYSTEM_DEFAULTS,
  ConversationGroup,
  ConversationGroupSystemKey,
} from "../database/entities";

@Injectable()
export class ConversationGroupDefaultsService {
  constructor(
    @InjectRepository(ConversationGroup)
    private readonly groupRepo: Repository<ConversationGroup>,
  ) {}

  async ensureSystemGroups(workspaceId: number): Promise<void> {
    for (const key of Object.values(ConversationGroupSystemKey)) {
      const defaults = CONVERSATION_GROUP_SYSTEM_DEFAULTS[key];
      const existing = await this.groupRepo.findOne({
        where: { workspaceId, systemKey: key },
      });
      if (existing) {
        continue;
      }
      await this.groupRepo.save(
        this.groupRepo.create({
          workspaceId,
          name: defaults.name,
          description: null,
          color: defaults.color,
          createdById: null,
          sortOrder: defaults.sortOrder,
          systemKey: key,
          isSystem: true,
        }),
      );
    }
  }

  async resolveSystemGroupId(
    workspaceId: number,
    key: ConversationGroupSystemKey,
  ): Promise<number> {
    await this.ensureSystemGroups(workspaceId);
    const row = await this.groupRepo.findOne({
      where: { workspaceId, systemKey: key },
      select: { id: true },
    });
    if (!row) {
      throw new Error(
        `System conversation group "${key}" missing for workspace ${workspaceId}`,
      );
    }
    return row.id;
  }

  async findSystemGroup(
    workspaceId: number,
    key: ConversationGroupSystemKey,
  ): Promise<ConversationGroup | null> {
    await this.ensureSystemGroups(workspaceId);
    return this.groupRepo.findOne({ where: { workspaceId, systemKey: key } });
  }
}
