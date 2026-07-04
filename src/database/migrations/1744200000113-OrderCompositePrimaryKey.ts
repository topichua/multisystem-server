import type { MigrationInterface, QueryRunner } from "typeorm";

const ORDER_ID_SEQUENCE_START = 1001;

export class OrderCompositePrimaryKey1744200000113
  implements MigrationInterface
{
  name = "OrderCompositePrimaryKey1744200000113";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "workspace_order_sequences" (
        "workspace_id" integer NOT NULL,
        "next_order_id" integer NOT NULL DEFAULT ${ORDER_ID_SEQUENCE_START},
        CONSTRAINT "PK_workspace_order_sequences" PRIMARY KEY ("workspace_id"),
        CONSTRAINT "FK_workspace_order_sequences_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "FK_order_items_order_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_events" DROP CONSTRAINT IF EXISTS "FK_order_events_order_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_movements" DROP CONSTRAINT IF EXISTS "FK_stock_movements_order_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD COLUMN IF NOT EXISTS "workspace_id" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "order_events"
      ADD COLUMN IF NOT EXISTS "workspace_id" integer
    `);

    await queryRunner.query(`
      UPDATE "order_items" oi
      SET "workspace_id" = o."workspace_id"
      FROM "orders" o
      WHERE oi."order_id" = o."id"
        AND oi."workspace_id" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "order_events" oe
      SET "workspace_id" = o."workspace_id"
      FROM "orders" o
      WHERE oe."order_id" = o."id"
        AND oe."workspace_id" IS NULL
    `);

    await queryRunner.query(`
      CREATE TEMP TABLE "order_id_map" (
        "workspace_id" integer NOT NULL,
        "old_id" integer NOT NULL,
        "new_id" integer NOT NULL,
        PRIMARY KEY ("workspace_id", "old_id")
      ) ON COMMIT DROP
    `);

    await queryRunner.query(`
      INSERT INTO "order_id_map" ("workspace_id", "old_id", "new_id")
      SELECT
        "workspace_id",
        "id",
        ${ORDER_ID_SEQUENCE_START - 1} + ROW_NUMBER() OVER (
          PARTITION BY "workspace_id"
          ORDER BY "created_at", "id"
        )
      FROM "orders"
    `);

    await queryRunner.query(`
      UPDATE "order_items" oi
      SET "order_id" = m."new_id"
      FROM "orders" o
      JOIN "order_id_map" m
        ON m."workspace_id" = o."workspace_id"
        AND m."old_id" = o."id"
      WHERE oi."order_id" = o."id"
    `);

    await queryRunner.query(`
      UPDATE "order_events" oe
      SET "order_id" = m."new_id"
      FROM "orders" o
      JOIN "order_id_map" m
        ON m."workspace_id" = o."workspace_id"
        AND m."old_id" = o."id"
      WHERE oe."order_id" = o."id"
    `);

    await queryRunner.query(`
      UPDATE "stock_movements" sm
      SET "order_id" = m."new_id"
      FROM "orders" o
      JOIN "order_id_map" m
        ON m."workspace_id" = o."workspace_id"
        AND m."old_id" = o."id"
      WHERE sm."order_id" = o."id"
        AND sm."workspace_id" = o."workspace_id"
    `);

    await queryRunner.query(`
      UPDATE "orders" o
      SET "id" = m."new_id"
      FROM "order_id_map" m
      WHERE o."workspace_id" = m."workspace_id"
        AND o."id" = m."old_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "orders" ALTER COLUMN "id" DROP DEFAULT
    `);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "orders_id_seq"`);

    await queryRunner.query(`
      ALTER TABLE "orders" DROP CONSTRAINT "PK_orders"
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD CONSTRAINT "PK_orders" PRIMARY KEY ("workspace_id", "id")
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items"
      ALTER COLUMN "workspace_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "order_events"
      ALTER COLUMN "workspace_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD CONSTRAINT "FK_order_items_order"
        FOREIGN KEY ("workspace_id", "order_id")
        REFERENCES "orders"("workspace_id", "id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "order_events"
      ADD CONSTRAINT "FK_order_events_order"
        FOREIGN KEY ("workspace_id", "order_id")
        REFERENCES "orders"("workspace_id", "id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD CONSTRAINT "FK_stock_movements_order"
        FOREIGN KEY ("workspace_id", "order_id")
        REFERENCES "orders"("workspace_id", "id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_order_items_workspace_order"
      ON "order_items" ("workspace_id", "order_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_order_events_workspace_order"
      ON "order_events" ("workspace_id", "order_id")
    `);

    await queryRunner.query(`
      INSERT INTO "workspace_order_sequences" ("workspace_id", "next_order_id")
      SELECT
        w."id",
        GREATEST(
          COALESCE(
            (SELECT MAX(o."id") + 1 FROM "orders" o WHERE o."workspace_id" = w."id"),
            ${ORDER_ID_SEQUENCE_START}
          ),
          ${ORDER_ID_SEQUENCE_START}
        )
      FROM "workspace" w
      ON CONFLICT ("workspace_id") DO NOTHING
    `);
  }

  public async down(): Promise<void> {
    // Non-reversible: global serial ids cannot be restored safely.
  }
}
