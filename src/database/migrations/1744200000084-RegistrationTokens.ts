import { MigrationInterface, QueryRunner } from "typeorm";

export class RegistrationTokens1744200000084 implements MigrationInterface {
  name = "RegistrationTokens1744200000084";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "registration_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "token_hash" character varying(64) NOT NULL,
        "email" character varying(255) NOT NULL,
        "company_name" character varying(255) NOT NULL,
        "first_name" character varying(120) NOT NULL,
        "last_name" character varying(120) NOT NULL,
        "password_hash" text NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "used_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_registration_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_registration_tokens_token_hash" UNIQUE ("token_hash")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_registration_tokens_email"
      ON "registration_tokens" ("email")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "registration_tokens"`);
  }
}
