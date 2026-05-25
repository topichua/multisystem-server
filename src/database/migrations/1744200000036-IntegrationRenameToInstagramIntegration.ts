import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Renames `integration` → `instagram_integration`. PostgreSQL keeps FK targets
 * on `products`, `product_variants`, etc. (`company_id`) valid after the rename.
 */
export class IntegrationRenameToInstagramIntegration1744200000036 implements MigrationInterface {
  name = "IntegrationRenameToInstagramIntegration1744200000036";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "integration" RENAME TO "instagram_integration"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_integration_owner_id" RENAME TO "IDX_instagram_integration_owner_id"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_integration_workspace_id" RENAME TO "IDX_instagram_integration_workspace_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instagram_integration" RENAME CONSTRAINT "PK_integration" TO "PK_instagram_integration"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instagram_integration" RENAME CONSTRAINT "FK_integration_owner_id_users_id" TO "FK_instagram_integration_owner_id_users_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instagram_integration" RENAME CONSTRAINT "FK_integration_workspace_id" TO "FK_instagram_integration_workspace_id"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "instagram_integration" RENAME CONSTRAINT "FK_instagram_integration_workspace_id" TO "FK_integration_workspace_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instagram_integration" RENAME CONSTRAINT "FK_instagram_integration_owner_id_users_id" TO "FK_integration_owner_id_users_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instagram_integration" RENAME CONSTRAINT "PK_instagram_integration" TO "PK_integration"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_instagram_integration_workspace_id" RENAME TO "IDX_integration_workspace_id"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_instagram_integration_owner_id" RENAME TO "IDX_integration_owner_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instagram_integration" RENAME TO "integration"`,
    );
  }
}
