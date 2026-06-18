import { MigrationInterface, QueryRunner } from "typeorm";

export class NovaPoshtaIntegrations1744200000076 implements MigrationInterface {
  name = "NovaPoshtaIntegrations1744200000076";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "novaposhta_integrations" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "owner_id" integer NOT NULL,
        "name" character varying(255) NOT NULL DEFAULT 'Nova Poshta',
        "api_key" text NOT NULL,
        "connected_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_novaposhta_integrations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_novaposhta_integrations_workspace_id" UNIQUE ("workspace_id"),
        CONSTRAINT "FK_novaposhta_integrations_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_novaposhta_integrations_owner_id"
          FOREIGN KEY ("owner_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_novaposhta_integrations_workspace_id" ON "novaposhta_integrations" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_novaposhta_integrations_owner_id" ON "novaposhta_integrations" ("owner_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "novaposhta_integrations"`);
  }
}
