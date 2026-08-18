import { MigrationInterface, QueryRunner } from "typeorm";

export class ConversationExternalIdNullable1744200000193 implements MigrationInterface {
  name = "ConversationExternalIdNullable1744200000193";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversations"
        ALTER COLUMN "external_id" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "conversations"
      SET "external_id" = ''
      WHERE "external_id" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations"
        ALTER COLUMN "external_id" SET NOT NULL
    `);
  }
}
