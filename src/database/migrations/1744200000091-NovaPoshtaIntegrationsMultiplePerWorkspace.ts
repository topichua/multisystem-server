import type { MigrationInterface, QueryRunner } from "typeorm";

export class NovaPoshtaIntegrationsMultiplePerWorkspace1744200000091 implements MigrationInterface {
  name = "NovaPoshtaIntegrationsMultiplePerWorkspace1744200000091";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "novaposhta_integrations"
      DROP CONSTRAINT "UQ_novaposhta_integrations_workspace_id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "novaposhta_integrations" AS n
      USING "novaposhta_integrations" AS keep
      WHERE
        n."workspace_id" = keep."workspace_id"
        AND n."id" > keep."id"
    `);

    await queryRunner.query(`
      ALTER TABLE "novaposhta_integrations"
      ADD CONSTRAINT "UQ_novaposhta_integrations_workspace_id" UNIQUE ("workspace_id")
    `);
  }
}
