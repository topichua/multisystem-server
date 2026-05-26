import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceRolesAndMembers1744200000039 implements MigrationInterface {
  name = "WorkspaceRolesAndMembers1744200000039";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "workspace_roles" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "slug" character varying(64) NOT NULL,
        "name" character varying(255) NOT NULL,
        "permissions" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspace_roles" PRIMARY KEY ("id"),
        CONSTRAINT "FK_workspace_roles_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "UQ_workspace_roles_workspace_slug" UNIQUE ("workspace_id", "slug")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_workspace_roles_workspace_id" ON "workspace_roles" ("workspace_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "workspace_members" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "role_id" integer NOT NULL,
        "status" character varying(32) NOT NULL DEFAULT 'active',
        "invited_by_user_id" integer,
        "joined_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspace_members" PRIMARY KEY ("id"),
        CONSTRAINT "FK_workspace_members_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_workspace_members_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_workspace_members_role_id"
          FOREIGN KEY ("role_id") REFERENCES "workspace_roles"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_workspace_members_invited_by_user_id"
          FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "UQ_workspace_members_workspace_user" UNIQUE ("workspace_id", "user_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_workspace_members_workspace_id" ON "workspace_members" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workspace_members_user_id" ON "workspace_members" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "workspace_invitations" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "email" character varying(255) NOT NULL,
        "role_id" integer NOT NULL,
        "invited_by_user_id" integer NOT NULL,
        "status" character varying(32) NOT NULL DEFAULT 'pending',
        "token_hash" text,
        "expires_at" TIMESTAMPTZ,
        "accepted_at" TIMESTAMPTZ,
        "accepted_user_id" integer,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspace_invitations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_workspace_invitations_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_workspace_invitations_role_id"
          FOREIGN KEY ("role_id") REFERENCES "workspace_roles"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_workspace_invitations_invited_by_user_id"
          FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_workspace_invitations_workspace_id" ON "workspace_invitations" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workspace_invitations_email" ON "workspace_invitations" ("email")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_invitations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_roles"`);
  }
}
