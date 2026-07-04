import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { EntityManager } from "typeorm";
import { DataSource } from "typeorm";
import { ORDER_ID_SEQUENCE_START } from "./order-id.constants";

@Injectable()
export class OrderIdAllocationService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async allocateNextOrderId(
    workspaceId: number,
    manager?: EntityManager,
  ): Promise<number> {
    const em = manager ?? this.dataSource.manager;
    await em.query(
      `
      INSERT INTO "workspace_order_sequences" ("workspace_id", "next_order_id")
      VALUES ($1, $2)
      ON CONFLICT ("workspace_id") DO NOTHING
      `,
      [workspaceId, ORDER_ID_SEQUENCE_START],
    );
    const rows = await em.query(
      `
      UPDATE "workspace_order_sequences"
      SET "next_order_id" = "next_order_id" + 1
      WHERE "workspace_id" = $1
      RETURNING "next_order_id" - 1 AS "id"
      `,
      [workspaceId],
    );
    const id = Number(rows[0]?.id);
    if (!Number.isInteger(id) || id < ORDER_ID_SEQUENCE_START) {
      throw new Error(
        `Failed to allocate order id for workspace ${workspaceId}`,
      );
    }
    return id;
  }
}
