import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * New automation action: CHANGE_CONVERSATION_GROUP (move order's chat to a workspace group).
 * Makes target_order_status_id optional; adds target_conversation_group_id.
 */
export class AutomationChangeConversationGroup1744200000184
  implements MigrationInterface
{
  name = "AutomationChangeConversationGroup1744200000184";

  /** Enum ADD VALUE must not share a transaction with DDL that uses the value. */
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "automation_action_type_enum"
      ADD VALUE IF NOT EXISTS 'CHANGE_CONVERSATION_GROUP'
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      ALTER COLUMN "target_order_status_id" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      ADD COLUMN IF NOT EXISTS "target_conversation_group_id" integer
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_order_status_automations_target_conversation_group'
        ) THEN
          ALTER TABLE "order_status_automations"
          ADD CONSTRAINT "FK_order_status_automations_target_conversation_group"
          FOREIGN KEY ("target_conversation_group_id")
          REFERENCES "conversation_groups"("id")
          ON DELETE RESTRICT;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automation_executions"
      ALTER COLUMN "target_order_status_id" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automation_executions"
      ADD COLUMN IF NOT EXISTS "previous_conversation_group_id" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automation_executions"
      ADD COLUMN IF NOT EXISTS "target_conversation_group_id" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_status_automation_executions"
      DROP COLUMN IF EXISTS "target_conversation_group_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_status_automation_executions"
      DROP COLUMN IF EXISTS "previous_conversation_group_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      DROP CONSTRAINT IF EXISTS "FK_order_status_automations_target_conversation_group"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      DROP COLUMN IF EXISTS "target_conversation_group_id"
    `);

    // Restore NOT NULL only if no nulls remain.
    await queryRunner.query(`
      UPDATE "order_status_automations"
      SET "target_order_status_id" = (
        SELECT s.id FROM "order_statuses" s
        WHERE s.workspace_id = "order_status_automations".workspace_id
        ORDER BY s.id ASC LIMIT 1
      )
      WHERE "target_order_status_id" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "order_status_automations"
      ALTER COLUMN "target_order_status_id" SET NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "order_status_automation_executions"
      SET "target_order_status_id" = 0
      WHERE "target_order_status_id" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "order_status_automation_executions"
      ALTER COLUMN "target_order_status_id" SET NOT NULL
    `);
  }
}
