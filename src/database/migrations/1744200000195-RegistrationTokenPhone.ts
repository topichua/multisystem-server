import { MigrationInterface, QueryRunner } from "typeorm";

export class RegistrationTokenPhone1744200000195 implements MigrationInterface {
  name = "RegistrationTokenPhone1744200000195";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "registration_tokens"
        ADD COLUMN IF NOT EXISTS "phone" character varying(64) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "registration_tokens"
        DROP COLUMN IF EXISTS "phone"
    `);
  }
}
