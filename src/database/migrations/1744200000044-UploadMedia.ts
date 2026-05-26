import { MigrationInterface, QueryRunner } from "typeorm";

export class UploadMedia1744200000044 implements MigrationInterface {
  name = "UploadMedia1744200000044";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "upload_media" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "cdn_url" text NOT NULL,
        "cloudflare_image_id" character varying(255) NULL,
        "created_by_user_id" integer NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_upload_media" PRIMARY KEY ("id"),
        CONSTRAINT "FK_upload_media_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_upload_media_created_by_user_id"
          FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_upload_media_workspace_id" ON "upload_media" ("workspace_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_upload_media_workspace_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "upload_media"`);
  }
}
