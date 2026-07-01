import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceDropInventoryMode1744200000095
  implements MigrationInterface
{
  name = "WorkspaceDropInventoryMode1744200000095";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace"
      DROP COLUMN IF EXISTS "inventory_mode"
    `);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "workspace_inventory_mode_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "workspace_inventory_mode_enum" AS ENUM (
        'off',
        'simple',
        'advanced'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace"
      ADD COLUMN "inventory_mode" "workspace_inventory_mode_enum" NOT NULL DEFAULT 'advanced'
    `);
  }
}
