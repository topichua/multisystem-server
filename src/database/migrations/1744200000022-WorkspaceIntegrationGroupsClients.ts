import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `workspace`, links `integration.workspace_id`, replaces
 * `conversation_groups.company_id` with `workspace_id`, and adds `clients.workspace_id`.
 */
export class WorkspaceIntegrationGroupsClients1744200000022 implements MigrationInterface {
  name = "WorkspaceIntegrationGroupsClients1744200000022";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "workspace" (
        "id" SERIAL NOT NULL,
        "name" character varying(255) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "owner_id" integer NOT NULL,
        CONSTRAINT "PK_workspace" PRIMARY KEY ("id"),
        CONSTRAINT "FK_workspace_owner_id_users_id"
          FOREIGN KEY ("owner_id") REFERENCES "users"("id")
          ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_workspace_owner_id" ON "workspace" ("owner_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "integration" ADD COLUMN "workspace_id" integer`,
    );

    const integrations = (await queryRunner.query(
      `SELECT id, name, created_at, owner_id FROM "integration"`,
    )) as Array<{
      id: number;
      name: string;
      created_at: Date;
      owner_id: number;
    }>;

    for (const row of integrations) {
      const inserted = (await queryRunner.query(
        `INSERT INTO "workspace" ("name", "created_at", "owner_id") VALUES ($1, $2, $3) RETURNING id`,
        [row.name, row.created_at, row.owner_id],
      )) as Array<{ id: number }>;
      const wid = inserted[0].id;
      await queryRunner.query(
        `UPDATE "integration" SET "workspace_id" = $1 WHERE "id" = $2`,
        [wid, row.id],
      );
    }

    await queryRunner.query(`
      ALTER TABLE "integration"
      ADD CONSTRAINT "FK_integration_workspace_id"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_integration_workspace_id" ON "integration" ("workspace_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration" ALTER COLUMN "workspace_id" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "conversation_groups" ADD COLUMN "workspace_id" integer`,
    );
    await queryRunner.query(`
      UPDATE "conversation_groups" AS cg
      SET "workspace_id" = i."workspace_id"
      FROM "integration" AS i
      WHERE cg."company_id" = i."id"
    `);

    const orphanGroups = (await queryRunner.query(
      `SELECT COUNT(*)::text AS c FROM "conversation_groups" WHERE "workspace_id" IS NULL`,
    )) as Array<{ c: string }>;
    if (Number(orphanGroups[0].c) > 0) {
      throw new Error(
        "Migration: conversation_groups.company_id does not match any integration row; fix data and retry.",
      );
    }

    await queryRunner.query(
      `ALTER TABLE "conversation_groups" DROP CONSTRAINT "FK_conversation_groups_company_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_conversation_groups_company_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversation_groups" DROP COLUMN "company_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversation_groups" ALTER COLUMN "workspace_id" SET NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "conversation_groups"
      ADD CONSTRAINT "FK_conversation_groups_workspace_id"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_conversation_groups_workspace_id" ON "conversation_groups" ("workspace_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "clients" ADD COLUMN "workspace_id" integer`,
    );

    const clientCountRow = (await queryRunner.query(
      `SELECT COUNT(*)::text AS c FROM "clients"`,
    )) as Array<{ c: string }>;
    const clientCount = Number(clientCountRow[0].c);
    if (clientCount > 0) {
      const workspaceCountRow = (await queryRunner.query(
        `SELECT COUNT(*)::text AS c FROM "workspace"`,
      )) as Array<{ c: string }>;
      if (Number(workspaceCountRow[0].c) === 0) {
        const userRow = (await queryRunner.query(
          `SELECT id FROM "users" ORDER BY id ASC LIMIT 1`,
        )) as Array<{ id: number }>;
        if (userRow.length === 0) {
          throw new Error(
            "Migration: clients exist but no users row to own a fallback workspace.",
          );
        }
        await queryRunner.query(
          `INSERT INTO "workspace" ("name", "created_at", "owner_id") VALUES ($1, now(), $2)`,
          ["Default", userRow[0].id],
        );
      }
      await queryRunner.query(`
        UPDATE "clients"
        SET "workspace_id" = (SELECT MIN("id") FROM "workspace")
        WHERE "workspace_id" IS NULL
      `);
    }

    await queryRunner.query(`
      ALTER TABLE "clients"
      ADD CONSTRAINT "FK_clients_workspace_id"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_clients_workspace_id" ON "clients" ("workspace_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" ALTER COLUMN "workspace_id" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clients" DROP CONSTRAINT "FK_clients_workspace_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clients_workspace_id"`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "workspace_id"`);

    await queryRunner.query(
      `ALTER TABLE "conversation_groups" DROP CONSTRAINT "FK_conversation_groups_workspace_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_conversation_groups_workspace_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversation_groups" ADD COLUMN "company_id" integer`,
    );
    await queryRunner.query(`
      UPDATE "conversation_groups" AS cg
      SET "company_id" = i."id"
      FROM (
        SELECT DISTINCT ON ("workspace_id") "id", "workspace_id"
        FROM "integration"
        ORDER BY "workspace_id", "id"
      ) AS i
      WHERE cg."workspace_id" = i."workspace_id"
    `);
    const gNull = (await queryRunner.query(
      `SELECT COUNT(*)::text AS c FROM "conversation_groups" WHERE "company_id" IS NULL`,
    )) as Array<{ c: string }>;
    if (Number(gNull[0].c) > 0) {
      throw new Error(
        "Migration down: cannot infer company_id for every conversation_group (multiple integrations per workspace).",
      );
    }
    await queryRunner.query(
      `ALTER TABLE "conversation_groups" DROP COLUMN "workspace_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversation_groups" ALTER COLUMN "company_id" SET NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "conversation_groups"
      ADD CONSTRAINT "FK_conversation_groups_company_id"
      FOREIGN KEY ("company_id") REFERENCES "integration"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_conversation_groups_company_id" ON "conversation_groups" ("company_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "integration" DROP CONSTRAINT "FK_integration_workspace_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_integration_workspace_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration" DROP COLUMN "workspace_id"`,
    );

    await queryRunner.query(`DROP TABLE "workspace"`);
  }
}
