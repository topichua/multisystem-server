import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceExportJobs1744200000177 implements MigrationInterface {
  name = "WorkspaceExportJobs1744200000177";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workspace_export_jobs" (
        "id" character varying(64) NOT NULL,
        "workspace_id" integer NOT NULL,
        "requested_by_id" integer NOT NULL,
        "type" character varying(32) NOT NULL,
        "mode" character varying(32),
        "format" character varying(8) NOT NULL,
        "filters" jsonb,
        "options" jsonb,
        "status" character varying(16) NOT NULL,
        "progress" integer NOT NULL DEFAULT 0,
        "file_key" text,
        "file_name" character varying(512),
        "file_size" bigint,
        "error_message" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "started_at" TIMESTAMPTZ,
        "completed_at" TIMESTAMPTZ,
        "expires_at" TIMESTAMPTZ,
        CONSTRAINT "PK_workspace_export_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_workspace_export_jobs_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_workspace_export_jobs_requested_by_id"
          FOREIGN KEY ("requested_by_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workspace_export_jobs_workspace_id"
      ON "workspace_export_jobs" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workspace_export_jobs_workspace_status"
      ON "workspace_export_jobs" ("workspace_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workspace_export_jobs_status_created"
      ON "workspace_export_jobs" ("status", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workspace_export_jobs_type_status"
      ON "workspace_export_jobs" ("type", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_workspace_export_jobs_type_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_workspace_export_jobs_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_workspace_export_jobs_workspace_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_workspace_export_jobs_workspace_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_export_jobs"`);
  }
}
