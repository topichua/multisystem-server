import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductMediaWorkspaceId1744200000101
  implements MigrationInterface
{
  name = "ProductMediaWorkspaceId1744200000101";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_media"
      ADD COLUMN "workspace_id" integer
    `);
    await queryRunner.query(`
      UPDATE "product_media" pm
      SET "workspace_id" = p."workspace_id"
      FROM "products" p
      WHERE pm."product_id" = p."id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_media"
      ALTER COLUMN "workspace_id" SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_product_media_workspace_id"
      ON "product_media" ("workspace_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "product_media"
      ADD CONSTRAINT "FK_product_media_workspace_id"
      FOREIGN KEY ("workspace_id")
      REFERENCES "workspace" ("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_media"
      DROP CONSTRAINT "FK_product_media_workspace_id"
    `);
    await queryRunner.query(`
      DROP INDEX "IDX_product_media_workspace_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_media"
      DROP COLUMN "workspace_id"
    `);
  }
}
