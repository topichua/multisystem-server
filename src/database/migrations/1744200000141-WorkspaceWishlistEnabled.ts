import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceWishlistEnabled1744200000141
  implements MigrationInterface
{
  name = "WorkspaceWishlistEnabled1744200000141";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace"
      ADD COLUMN "wishlist_enabled" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace"
      DROP COLUMN IF EXISTS "wishlist_enabled"
    `);
  }
}
