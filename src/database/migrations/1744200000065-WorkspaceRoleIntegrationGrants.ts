import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceRoleIntegrationGrants1744200000065 implements MigrationInterface {
  name = "WorkspaceRoleIntegrationGrants1744200000065";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "workspace_role_integration_grants" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "role_id" integer NOT NULL,
        "integration_type" character varying(32) NOT NULL,
        "integration_id" integer NOT NULL,
        "granted_by_user_id" integer,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspace_role_integration_grants" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_workspace_role_integration_grants"
          UNIQUE ("role_id", "integration_type", "integration_id"),
        CONSTRAINT "FK_workspace_role_integration_grants_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_workspace_role_integration_grants_role_id"
          FOREIGN KEY ("role_id") REFERENCES "workspace_roles"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_workspace_role_integration_grants_granted_by_user_id"
          FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_workspace_role_integration_grants_role_id" ON "workspace_role_integration_grants" ("role_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workspace_role_integration_grants_workspace_id" ON "workspace_role_integration_grants" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workspace_role_integration_grants_integration" ON "workspace_role_integration_grants" ("integration_type", "integration_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "workspace_role_integration_grants"`);
  }
}
