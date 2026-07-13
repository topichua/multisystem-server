import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveConversationManagerId1744200000106 implements MigrationInterface {
  name = "RemoveConversationManagerId1744200000106";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversations"
      DROP CONSTRAINT IF EXISTS "UQ_conversations_manager_external_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_conversations_manager_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations"
      DROP CONSTRAINT IF EXISTS "FK_conversations_manager_id_users_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations"
      DROP COLUMN "manager_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD CONSTRAINT "UQ_conversations_workspace_external_id"
        UNIQUE ("workspace_id", "external_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversations"
      DROP CONSTRAINT IF EXISTS "UQ_conversations_workspace_external_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD COLUMN "manager_id" integer NULL
    `);
    await queryRunner.query(`
      UPDATE "conversations" c
      SET "manager_id" = w."owner_id"
      FROM "workspace" w
      WHERE c."workspace_id" = w."id"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations"
      ALTER COLUMN "manager_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD CONSTRAINT "FK_conversations_manager_id_users_id"
        FOREIGN KEY ("manager_id")
        REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_conversations_manager_id"
      ON "conversations" ("manager_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD CONSTRAINT "UQ_conversations_manager_external_id"
        UNIQUE ("manager_id", "external_id")
    `);
  }
}
