import { MigrationInterface, QueryRunner } from "typeorm";

export class UserAvatarSrcWorkspaceMemberColor1744200000069 implements MigrationInterface {
  name = "UserAvatarSrcWorkspaceMemberColor1744200000069";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "avatar_src" character varying(2048) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_members"
      ADD COLUMN "color" character varying(64) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_members"
      DROP COLUMN "color"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "avatar_src"
    `);
  }
}
