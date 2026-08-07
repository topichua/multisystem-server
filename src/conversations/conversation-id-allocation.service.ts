import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { EntityManager } from "typeorm";
import { DataSource } from "typeorm";
import { readPostgresQueryRows } from "../database/postgres-query-rows.util";
import { CONVERSATION_ID_SEQUENCE_START } from "./conversation-id.constants";

type AllocatedConversationIdRow = {
  id: number | string;
};

@Injectable()
export class ConversationIdAllocationService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async allocateNextConversationId(
    workspaceId: number,
    manager?: EntityManager,
  ): Promise<number> {
    const em = manager ?? this.dataSource.manager;
    const result = await em.query(
      `
      INSERT INTO "workspace_conversation_sequences" ("workspace_id", "next_conversation_id")
      VALUES ($1, $2 + 1)
      ON CONFLICT ("workspace_id") DO UPDATE
      SET "next_conversation_id" = "workspace_conversation_sequences"."next_conversation_id" + 1
      RETURNING "next_conversation_id" - 1 AS "id"
      `,
      [workspaceId, CONVERSATION_ID_SEQUENCE_START],
    );

    const id = Number(
      readPostgresQueryRows<AllocatedConversationIdRow>(result)[0]?.id,
    );
    if (!Number.isInteger(id) || id < CONVERSATION_ID_SEQUENCE_START) {
      throw new InternalServerErrorException(
        `Failed to allocate conversation id for workspace ${workspaceId}`,
      );
    }
    return id;
  }
}
