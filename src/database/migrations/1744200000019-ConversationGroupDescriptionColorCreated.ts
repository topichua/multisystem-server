import { MigrationInterface, QueryRunner } from "typeorm";

export class ConversationGroupDescriptionColorCreated1744200000019 implements MigrationInterface {
  name = "ConversationGroupDescriptionColorCreated1744200000019";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversation_groups"
      ADD COLUMN IF NOT EXISTS "description" text NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_groups"
      ADD COLUMN IF NOT EXISTS "color" character varying(64) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_groups"
      ADD COLUMN IF NOT EXISTS "created_at" timestamptz NOT NULL DEFAULT now()
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_groups"
      ADD COLUMN IF NOT EXISTS "created_by_id" integer NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_groups"
      ADD CONSTRAINT "FK_conversation_groups_created_by_id"
      FOREIGN KEY ("created_by_id")
      REFERENCES "users"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversation_groups"
      DROP CONSTRAINT IF EXISTS "FK_conversation_groups_created_by_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_groups" DROP COLUMN IF EXISTS "created_by_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_groups" DROP COLUMN IF EXISTS "created_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_groups" DROP COLUMN IF EXISTS "color"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_groups" DROP COLUMN IF EXISTS "description"
    `);
  }
}
