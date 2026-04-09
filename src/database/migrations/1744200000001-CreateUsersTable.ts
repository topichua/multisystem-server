import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1744200000001 implements MigrationInterface {
  name = 'CreateUsersTable1744200000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" SERIAL NOT NULL,
        "email" character varying(255) NOT NULL,
        "password_hash" text,
        "first_name" character varying(120) NOT NULL,
        "last_name" character varying(120),
        "mobile_phone_hash" character varying(255),
        "status" smallint NOT NULL DEFAULT 0,
        "invited_at" timestamptz,
        "invited_by_user_id" integer,
        "invitation_token_hash" text,
        "invitation_expires_at" timestamptz,
        "invitation_accepted_at" timestamptz,
        "email_verified_at" timestamptz,
        "last_seen_at" timestamptz,
        "last_login_at" timestamptz,
        "country" character varying(120),
        "region" character varying(120),
        "city" character varying(120),
        "street_line_1" character varying(255),
        "street_line_2" character varying(255),
        "postal_code" character varying(40),
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_users_status" CHECK ("status" IN (0, 1, 2))
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_status" ON "users" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_last_seen_at" ON "users" ("last_seen_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_invited_by_user_id" ON "users" ("invited_by_user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
