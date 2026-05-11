import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrdersModule1744200000032 implements MigrationInterface {
  name = "OrdersModule1744200000032";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "orders_order_source_enum" AS ENUM ('instagram', 'telegram', 'manual')
    `);
    await queryRunner.query(`
      CREATE TYPE "orders_payment_status_enum" AS ENUM ('unpaid', 'partial', 'paid', 'refunded')
    `);
    await queryRunner.query(`
      CREATE TYPE "orders_delivery_status_enum" AS ENUM ('pending', 'shipped', 'delivered', 'returned')
    `);
    await queryRunner.query(`
      CREATE TYPE "order_statuses_category_enum" AS ENUM (
        'new', 'confirmed', 'packed', 'shipped', 'completed', 'canceled'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "order_delivery_provider_enum" AS ENUM (
        'nova_poshta', 'ukrposhta', 'manual', 'other'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "order_statuses" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "name" character varying(120) NOT NULL,
        "category" "order_statuses_category_enum" NOT NULL,
        "color" character varying(32),
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_default" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_statuses" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_statuses_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_order_statuses_workspace_id" ON "order_statuses" ("workspace_id")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_order_statuses_workspace_default"
      ON "order_statuses" ("workspace_id")
      WHERE "is_default" = true
    `);

    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "customer_id" integer NOT NULL,
        "conversation_id" integer,
        "source" "orders_order_source_enum" NOT NULL,
        "status_id" integer NOT NULL,
        "payment_status" "orders_payment_status_enum" NOT NULL DEFAULT 'unpaid',
        "delivery_status" "orders_delivery_status_enum" NOT NULL DEFAULT 'pending',
        "currency" character varying(8) NOT NULL DEFAULT 'UAH',
        "subtotal_amount" numeric(14, 2) NOT NULL DEFAULT 0,
        "discount_amount" numeric(14, 2) NOT NULL DEFAULT 0,
        "delivery_amount" numeric(14, 2) NOT NULL DEFAULT 0,
        "total_amount" numeric(14, 2) NOT NULL DEFAULT 0,
        "customer_note" text,
        "internal_note" text,
        "paid_at" TIMESTAMPTZ,
        "payment_reference" character varying(255),
        "created_by_id" integer NOT NULL,
        "updated_by_id" integer,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_orders_amounts_non_negative" CHECK (
          "subtotal_amount" >= 0 AND "discount_amount" >= 0
          AND "delivery_amount" >= 0 AND "total_amount" >= 0
        ),
        CONSTRAINT "FK_orders_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_orders_customer_id"
          FOREIGN KEY ("customer_id") REFERENCES "clients"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_orders_conversation_id"
          FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_orders_status_id"
          FOREIGN KEY ("status_id") REFERENCES "order_statuses"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_orders_created_by_id"
          FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_orders_updated_by_id"
          FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_workspace_id" ON "orders" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_customer_id" ON "orders" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_conversation_id" ON "orders" ("conversation_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_status_id" ON "orders" ("status_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id" SERIAL NOT NULL,
        "order_id" integer NOT NULL,
        "product_id" integer NOT NULL,
        "variant_id" integer NOT NULL,
        "quantity" integer NOT NULL,
        "unit_price_amount" numeric(14, 2) NOT NULL,
        "total_price_amount" numeric(14, 2) NOT NULL,
        "product_title_snapshot" character varying(512) NOT NULL,
        "variant_title_snapshot" character varying(512),
        "sku_snapshot" character varying(128),
        "image_url_snapshot" text,
        "variant_attributes_snapshot" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_items" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_order_items_quantity_positive" CHECK ("quantity" > 0),
        CONSTRAINT "CHK_order_items_prices_non_negative" CHECK (
          "unit_price_amount" >= 0 AND "total_price_amount" >= 0
        ),
        CONSTRAINT "FK_order_items_order_id"
          FOREIGN KEY ("order_id") REFERENCES "orders"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_order_items_product_id"
          FOREIGN KEY ("product_id") REFERENCES "products"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_order_items_variant_id"
          FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_order_items_order_id" ON "order_items" ("order_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "order_delivery_infos" (
        "id" SERIAL NOT NULL,
        "order_id" integer NOT NULL,
        "provider" "order_delivery_provider_enum" NOT NULL,
        "recipient_name" character varying(255),
        "phone" character varying(64),
        "city" character varying(255),
        "city_ref" character varying(255),
        "warehouse" character varying(255),
        "warehouse_ref" character varying(255),
        "address" text,
        "tracking_number" character varying(128),
        "raw_provider_payload" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_delivery_infos" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_order_delivery_infos_order_id" UNIQUE ("order_id"),
        CONSTRAINT "FK_order_delivery_infos_order_id"
          FOREIGN KEY ("order_id") REFERENCES "orders"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "order_events" (
        "id" SERIAL NOT NULL,
        "order_id" integer NOT NULL,
        "type" character varying(64) NOT NULL,
        "actor_id" integer,
        "payload" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_events_order_id"
          FOREIGN KEY ("order_id") REFERENCES "orders"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_order_events_actor_id"
          FOREIGN KEY ("actor_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_order_events_order_id" ON "order_events" ("order_id")`,
    );

    await queryRunner.query(`
      INSERT INTO "order_statuses" (
        "workspace_id", "name", "category", "color", "sort_order", "is_default", "created_at", "updated_at"
      )
      SELECT w."id", s."name", s."category", s."color", s."sort_order", s."is_default", now(), now()
      FROM "workspace" w
      CROSS JOIN (
        VALUES
          (0, 'New', 'new'::order_statuses_category_enum, '#6366f1', true),
          (1, 'Confirmed', 'confirmed'::order_statuses_category_enum, '#22c55e', false),
          (2, 'Packed', 'packed'::order_statuses_category_enum, '#eab308', false),
          (3, 'Shipped', 'shipped'::order_statuses_category_enum, '#3b82f6', false),
          (4, 'Completed', 'completed'::order_statuses_category_enum, '#10b981', false),
          (5, 'Canceled', 'canceled'::order_statuses_category_enum, '#ef4444', false)
      ) AS s("sort_order", "name", "category", "color", "is_default")
      WHERE NOT EXISTS (
        SELECT 1 FROM "order_statuses" x WHERE x."workspace_id" = w."id"
      )
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_seed_order_statuses_for_workspace()
      RETURNS trigger AS $$
      BEGIN
        INSERT INTO "order_statuses" (
          "workspace_id", "name", "category", "color", "sort_order", "is_default", "created_at", "updated_at"
        ) VALUES
          (NEW.id, 'New', 'new'::order_statuses_category_enum, '#6366f1', 0, true, now(), now()),
          (NEW.id, 'Confirmed', 'confirmed'::order_statuses_category_enum, '#22c55e', 1, false, now(), now()),
          (NEW.id, 'Packed', 'packed'::order_statuses_category_enum, '#eab308', 2, false, now(), now()),
          (NEW.id, 'Shipped', 'shipped'::order_statuses_category_enum, '#3b82f6', 3, false, now(), now()),
          (NEW.id, 'Completed', 'completed'::order_statuses_category_enum, '#10b981', 4, false, now(), now()),
          (NEW.id, 'Canceled', 'canceled'::order_statuses_category_enum, '#ef4444', 5, false, now(), now());
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_workspace_seed_order_statuses"
      AFTER INSERT ON "workspace"
      FOR EACH ROW
      EXECUTE PROCEDURE fn_seed_order_statuses_for_workspace()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_workspace_seed_order_statuses" ON "workspace"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS fn_seed_order_statuses_for_workspace()`,
    );

    await queryRunner.query(`DROP TABLE "order_events"`);
    await queryRunner.query(`DROP TABLE "order_delivery_infos"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TABLE "order_statuses"`);

    await queryRunner.query(`DROP TYPE "order_delivery_provider_enum"`);
    await queryRunner.query(`DROP TYPE "order_statuses_category_enum"`);
    await queryRunner.query(`DROP TYPE "orders_delivery_status_enum"`);
    await queryRunner.query(`DROP TYPE "orders_payment_status_enum"`);
    await queryRunner.query(`DROP TYPE "orders_order_source_enum"`);
  }
}
