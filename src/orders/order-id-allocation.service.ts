import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { EntityManager } from "typeorm";
import { DataSource } from "typeorm";
import { readPostgresQueryRows } from "../database/postgres-query-rows.util";
import { ORDER_ID_SEQUENCE_START } from "./order-id.constants";

type AllocatedOrderIdRow = {
  id: number | string;
};

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
    const result = await em.query(
      `
      INSERT INTO "workspace_order_sequences" ("workspace_id", "next_order_id")
      VALUES ($1, $2 + 1)
      ON CONFLICT ("workspace_id") DO UPDATE
      SET "next_order_id" = "workspace_order_sequences"."next_order_id" + 1
      RETURNING "next_order_id" - 1 AS "id"
      `,
      [workspaceId, ORDER_ID_SEQUENCE_START],
    );

    const id = Number(
      readPostgresQueryRows<AllocatedOrderIdRow>(result)[0]?.id,
    );
    if (!Number.isInteger(id) || id < ORDER_ID_SEQUENCE_START) {
      throw new InternalServerErrorException(
        `Failed to allocate order id for workspace ${workspaceId}`,
      );
    }
    return id;
  }
}
