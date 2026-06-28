import { MigrationInterface, QueryRunner } from "typeorm";

export class UserPhone1744200000083 implements MigrationInterface {
  name = "UserPhone1744200000083";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "phone" character varying(64) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "phone"
    `);
  }
}
