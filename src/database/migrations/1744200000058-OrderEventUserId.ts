import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrderEventUserId1744200000058 implements MigrationInterface {
  name = "OrderEventUserId1744200000058";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_events" ADD COLUMN "user_id" integer`);
    await queryRunner.query(`
      ALTER TABLE "order_events"
      ADD CONSTRAINT "FK_order_events_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_order_events_user_id" ON "order_events" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_order_events_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_events" DROP CONSTRAINT IF EXISTS "FK_order_events_user_id"`,
    );
    await queryRunner.query(`ALTER TABLE "order_events" DROP COLUMN IF EXISTS "user_id"`);
  }
}
