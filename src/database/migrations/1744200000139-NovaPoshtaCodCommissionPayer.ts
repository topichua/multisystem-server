import { MigrationInterface, QueryRunner } from "typeorm";

export class NovaPoshtaCodCommissionPayer1744200000139
  implements MigrationInterface
{
  name = "NovaPoshtaCodCommissionPayer1744200000139";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "novaposhta_integrations"
      ADD COLUMN "cod_commission_payer" character varying(32)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "novaposhta_integrations"
      DROP COLUMN IF EXISTS "cod_commission_payer"
    `);
  }
}
