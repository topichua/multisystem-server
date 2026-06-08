import type { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceTemplates1744200000059 implements MigrationInterface {
  name = "WorkspaceTemplates1744200000059";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "workspace_templates" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "name" character varying(255) NOT NULL,
        "template" text NOT NULL,
        "created_by" integer NOT NULL,
        "updated_by" integer,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspace_templates" PRIMARY KEY ("id"),
        CONSTRAINT "FK_workspace_templates_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_workspace_templates_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_workspace_templates_updated_by"
          FOREIGN KEY ("updated_by") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_workspace_templates_workspace_id" ON "workspace_templates" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workspace_templates_created_by" ON "workspace_templates" ("created_by")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workspace_templates_updated_by" ON "workspace_templates" ("updated_by")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_workspace_templates_updated_by"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_workspace_templates_created_by"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_workspace_templates_workspace_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_templates"`);
  }
}
