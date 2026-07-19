import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceMemberWorkStatus1744200000152 implements MigrationInterface {
  name = "WorkspaceMemberWorkStatus1744200000152";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_members"
      ADD COLUMN "work_status" character varying(32)
      NOT NULL DEFAULT 'accepting_new_chats'
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_members"
      ADD CONSTRAINT "CHK_workspace_members_work_status"
      CHECK (
        "work_status" IN (
          'accepting_new_chats',
          'not_accepting_new_chats',
          'break'
        )
      )
    `);

    await queryRunner.query(`
      INSERT INTO "workspace_roles" (
        "workspace_id",
        "slug",
        "name",
        "description",
        "color",
        "permissions"
      )
      SELECT
        w."id",
        'owner',
        'Owner',
        NULL,
        NULL,
        '[]'::jsonb
      FROM "workspace" w
      WHERE NOT EXISTS (
        SELECT 1
        FROM "workspace_roles" wr
        WHERE wr."workspace_id" = w."id"
          AND wr."slug" = 'owner'
      )
    `);

    await queryRunner.query(`
      INSERT INTO "workspace_members" (
        "workspace_id",
        "user_id",
        "role_id",
        "status",
        "invited_by_user_id",
        "joined_at",
        "work_status"
      )
      SELECT
        w."id",
        w."owner_id",
        wr."id",
        'active',
        NULL,
        COALESCE(w."created_at", now()),
        'accepting_new_chats'
      FROM "workspace" w
      INNER JOIN "workspace_roles" wr
        ON wr."workspace_id" = w."id"
       AND wr."slug" = 'owner'
      WHERE NOT EXISTS (
        SELECT 1
        FROM "workspace_members" wm
        WHERE wm."workspace_id" = w."id"
          AND wm."user_id" = w."owner_id"
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_members"
      DROP CONSTRAINT "CHK_workspace_members_work_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_members"
      DROP COLUMN "work_status"
    `);
  }
}
