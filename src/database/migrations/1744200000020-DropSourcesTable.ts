import { MigrationInterface, QueryRunner } from "typeorm";

export class DropSourcesTable1744200000020 implements MigrationInterface {
  name = "DropSourcesTable1744200000020";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sources"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sources" (
        "id" SERIAL NOT NULL,
        "name" character varying(255) NOT NULL,
        "company_id" integer NOT NULL,
        "token" text NOT NULL,
        CONSTRAINT "PK_sources" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sources_company_id"
          FOREIGN KEY ("company_id")
          REFERENCES "company"("id")
          ON DELETE CASCADE
          ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_sources_company_id" ON "sources" ("company_id")`,
    );
  }
}
