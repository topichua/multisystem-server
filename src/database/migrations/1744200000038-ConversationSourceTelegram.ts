import { MigrationInterface, QueryRunner } from "typeorm";

export class ConversationSourceTelegram1744200000038 implements MigrationInterface {
  name = "ConversationSourceTelegram1744200000038";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "CHK_conversations_source"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD CONSTRAINT "CHK_conversations_source" CHECK ("source" IN (1, 2))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "CHK_conversations_source"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD CONSTRAINT "CHK_conversations_source" CHECK ("source" IN (1))`,
    );
  }
}
