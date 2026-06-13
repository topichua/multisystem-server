import { MigrationInterface, QueryRunner } from "typeorm";

export class ConversationResponsibleMember1744200000071 implements MigrationInterface {
  name = "ConversationResponsibleMember1744200000071";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD COLUMN "responsible_member_id" integer NULL,
      ADD COLUMN "responsible_member_set_at" TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD CONSTRAINT "FK_conversations_responsible_member_id"
        FOREIGN KEY ("responsible_member_id")
        REFERENCES "workspace_members"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_conversations_responsible_member_id"
      ON "conversations" ("responsible_member_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_conversations_responsible_member_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "conversations"
      DROP CONSTRAINT IF EXISTS "FK_conversations_responsible_member_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations"
      DROP COLUMN "responsible_member_set_at",
      DROP COLUMN "responsible_member_id"
    `);
  }
}
