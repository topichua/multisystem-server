import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1744200000001 implements MigrationInterface {
  name = 'InitialSchema1744200000001';

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

    await queryRunner.query(`
      CREATE TABLE "company" (
        "id" SERIAL NOT NULL,
        "name" character varying(255) NOT NULL,
        "page_id" character varying(255) NOT NULL,
        "page_token" text NOT NULL,
        "access_token" text NOT NULL,
        "owner_id" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_company" PRIMARY KEY ("id"),
        CONSTRAINT "FK_company_owner_id_users_id"
          FOREIGN KEY ("owner_id")
          REFERENCES "users"("id")
          ON DELETE NO ACTION
          ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_company_owner_id" ON "company" ("owner_id")`,
    );

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

    await queryRunner.query(`
      CREATE TABLE "instagram_users" (
        "id" SERIAL NOT NULL,
        "name" character varying(255) NOT NULL,
        "username" character varying(255) NOT NULL,
        "profile_pic" text NOT NULL,
        "synced_at" timestamptz,
        "last_seen" timestamptz,
        CONSTRAINT "PK_instagram_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_instagram_users_username" ON "instagram_users" ("username")`,
    );

    await queryRunner.query(`
      CREATE TABLE "clients" (
        "id" SERIAL NOT NULL,
        "first_name" character varying(120) NOT NULL,
        "last_name" character varying(120) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "phone" character varying(64) NOT NULL,
        "delivery_info" text NOT NULL,
        "instagram_user_id" integer NOT NULL,
        CONSTRAINT "PK_clients" PRIMARY KEY ("id"),
        CONSTRAINT "FK_clients_instagram_user_id"
          FOREIGN KEY ("instagram_user_id")
          REFERENCES "instagram_users"("id")
          ON DELETE RESTRICT
          ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_clients_instagram_user_id" ON "clients" ("instagram_user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "conversation_groups" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "name" character varying(255) NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_conversation_groups" PRIMARY KEY ("id"),
        CONSTRAINT "FK_conversation_groups_company_id"
          FOREIGN KEY ("company_id")
          REFERENCES "company"("id")
          ON DELETE CASCADE
          ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_conversation_groups_company_id" ON "conversation_groups" ("company_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "conversations" (
        "id" SERIAL NOT NULL,
        "external_source_id" character varying(255) NOT NULL,
        "external_id" character varying(255) NOT NULL,
        "inst_updated_at" timestamptz NOT NULL,
        "read_at" timestamptz,
        "participant_id" character varying(255) NOT NULL,
        "source" smallint NOT NULL,
        "manager_id" integer NOT NULL,
        "group_id" integer,
        CONSTRAINT "PK_conversations" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_conversations_source" CHECK ("source" IN (1)),
        CONSTRAINT "UQ_conversations_manager_external_id"
          UNIQUE ("manager_id", "external_id"),
        CONSTRAINT "FK_conversations_manager_id_users_id"
          FOREIGN KEY ("manager_id")
          REFERENCES "users"("id")
          ON DELETE RESTRICT
          ON UPDATE NO ACTION,
        CONSTRAINT "FK_conversations_group_id_conversation_groups_id"
          FOREIGN KEY ("group_id")
          REFERENCES "conversation_groups"("id")
          ON DELETE SET NULL
          ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_conversations_manager_id" ON "conversations" ("manager_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_conversations_group_id" ON "conversations" ("group_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "conversation_messages" (
        "id" SERIAL NOT NULL,
        "conversation_id" integer NOT NULL,
        "external_id" character varying(255) NOT NULL,
        "message" text NOT NULL,
        "instagram_json" text NOT NULL,
        "created_at" timestamptz NOT NULL,
        "sender_id" character varying(255) NOT NULL,
        "receiver_id" character varying(255) NOT NULL,
        CONSTRAINT "PK_conversation_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_conversation_messages_conversation_id"
          FOREIGN KEY ("conversation_id")
          REFERENCES "conversations"("id")
          ON DELETE CASCADE
          ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_conversation_messages_conversation_id" ON "conversation_messages" ("conversation_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "conversation_messages"`);
    await queryRunner.query(`DROP TABLE "conversations"`);
    await queryRunner.query(`DROP TABLE "conversation_groups"`);
    await queryRunner.query(`DROP TABLE "clients"`);
    await queryRunner.query(`DROP TABLE "instagram_users"`);
    await queryRunner.query(`DROP TABLE "sources"`);
    await queryRunner.query(`DROP TABLE "company"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
