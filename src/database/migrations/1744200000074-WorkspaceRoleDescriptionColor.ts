import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceRoleDescriptionColor1744200000074 implements MigrationInterface {
  name = "WorkspaceRoleDescriptionColor1744200000074";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_roles"
      ADD COLUMN "description" text NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_roles"
      ADD COLUMN "color" character varying(64) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_roles" DROP COLUMN IF EXISTS "color"
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_roles" DROP COLUMN IF EXISTS "description"
    `);
  }
}
