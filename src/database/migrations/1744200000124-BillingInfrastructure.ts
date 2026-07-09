import { MigrationInterface, QueryRunner } from "typeorm";

export class BillingInfrastructure1744200000124 implements MigrationInterface {
  name = "BillingInfrastructure1744200000124";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "billing_cycle_enum" AS ENUM ('monthly', 'yearly')
    `);
    await queryRunner.query(`
      CREATE TYPE "workspace_subscription_status_enum" AS ENUM (
        'trial', 'active', 'past_due', 'canceled'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "invoice_status_enum" AS ENUM (
        'draft', 'open', 'paid', 'void', 'refunded'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "subscription_change_type_enum" AS ENUM (
        'subscribe', 'upgrade', 'downgrade', 'renewal', 'custom_override', 'cancel'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "workspace_entitlements" (
        "workspace_id" integer NOT NULL,
        "social_accounts_limit" integer,
        "private_accounts_limit" integer,
        "wishlist_enabled" boolean NOT NULL DEFAULT false,
        "advanced_inventory_enabled" boolean NOT NULL DEFAULT false,
        "advanced_analytics_enabled" boolean NOT NULL DEFAULT false,
        "ai_credits_monthly" integer NOT NULL DEFAULT 0,
        "ai_credits_used" integer NOT NULL DEFAULT 0,
        "credits_reset_at" TIMESTAMPTZ,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspace_entitlements" PRIMARY KEY ("workspace_id"),
        CONSTRAINT "FK_workspace_entitlements_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "plan_templates" (
        "id" SERIAL NOT NULL,
        "slug" character varying(64) NOT NULL,
        "name" character varying(120) NOT NULL,
        "is_public" boolean NOT NULL DEFAULT true,
        "workspace_id" integer,
        "entitlements" jsonb NOT NULL,
        "price_monthly" numeric(14,2) NOT NULL DEFAULT 0,
        "price_yearly" numeric(14,2) NOT NULL DEFAULT 0,
        "currency" character varying(8) NOT NULL DEFAULT 'UAH',
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_plan_templates" PRIMARY KEY ("id"),
        CONSTRAINT "FK_plan_templates_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_plan_templates_workspace_id"
      ON "plan_templates" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_plan_templates_global_slug"
      ON "plan_templates" ("slug")
      WHERE "workspace_id" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_plan_templates_workspace_slug"
      ON "plan_templates" ("workspace_id", "slug")
      WHERE "workspace_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "workspace_subscriptions" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "plan_template_id" integer,
        "status" "workspace_subscription_status_enum" NOT NULL DEFAULT 'active',
        "entitlements_snapshot" jsonb NOT NULL,
        "billing_cycle" "billing_cycle_enum" NOT NULL DEFAULT 'monthly',
        "period_start" TIMESTAMPTZ NOT NULL,
        "period_end" TIMESTAMPTZ NOT NULL,
        "custom_label" character varying(255),
        "canceled_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspace_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_workspace_subscriptions_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_workspace_subscriptions_plan_template_id"
          FOREIGN KEY ("plan_template_id") REFERENCES "plan_templates"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_workspace_subscriptions_workspace_id"
      ON "workspace_subscriptions" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_workspace_subscriptions_status"
      ON "workspace_subscriptions" ("status")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_workspace_subscriptions_active_workspace"
      ON "workspace_subscriptions" ("workspace_id")
      WHERE "status" IN ('trial', 'active', 'past_due')
    `);

    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "id" SERIAL NOT NULL,
        "workspace_id" integer NOT NULL,
        "subscription_id" integer,
        "number" character varying(64) NOT NULL,
        "status" "invoice_status_enum" NOT NULL DEFAULT 'open',
        "amount" numeric(14,2) NOT NULL,
        "currency" character varying(8) NOT NULL DEFAULT 'UAH',
        "period_start" TIMESTAMPTZ,
        "period_end" TIMESTAMPTZ,
        "description" text,
        "line_items" jsonb NOT NULL DEFAULT '[]',
        "due_at" TIMESTAMPTZ,
        "paid_at" TIMESTAMPTZ,
        "external_payment_id" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invoices" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_invoices_number" UNIQUE ("number"),
        CONSTRAINT "FK_invoices_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_invoices_subscription_id"
          FOREIGN KEY ("subscription_id") REFERENCES "workspace_subscriptions"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_invoices_workspace_id"
      ON "invoices" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_invoices_status"
      ON "invoices" ("status")
    `);

    await queryRunner.query(`
      CREATE TABLE "subscription_changes" (
        "id" SERIAL NOT NULL,
        "subscription_id" integer NOT NULL,
        "change_type" "subscription_change_type_enum" NOT NULL,
        "from_entitlements" jsonb,
        "to_entitlements" jsonb NOT NULL,
        "invoice_id" integer,
        "created_by_user_id" integer,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_subscription_changes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_subscription_changes_subscription_id"
          FOREIGN KEY ("subscription_id") REFERENCES "workspace_subscriptions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_subscription_changes_invoice_id"
          FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_subscription_changes_created_by_user_id"
          FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_subscription_changes_subscription_id"
      ON "subscription_changes" ("subscription_id")
    `);

    const freeEntitlements = JSON.stringify({
      socialAccountsLimit: 1,
      privateAccountsLimit: 0,
      wishlistEnabled: false,
      advancedInventoryEnabled: false,
      advancedAnalyticsEnabled: false,
      aiCreditsMonthly: 0,
    });
    const starterEntitlements = JSON.stringify({
      socialAccountsLimit: 2,
      privateAccountsLimit: 1,
      wishlistEnabled: true,
      advancedInventoryEnabled: false,
      advancedAnalyticsEnabled: false,
      aiCreditsMonthly: 100,
    });
    const proEntitlements = JSON.stringify({
      socialAccountsLimit: 5,
      privateAccountsLimit: 3,
      wishlistEnabled: true,
      advancedInventoryEnabled: true,
      advancedAnalyticsEnabled: true,
      aiCreditsMonthly: 1000,
    });

    await queryRunner.query(`
      INSERT INTO "plan_templates"
        ("slug", "name", "is_public", "entitlements", "price_monthly", "price_yearly", "currency", "sort_order")
      VALUES
        ('free', 'Free', true, '${freeEntitlements}'::jsonb, 0, 0, 'UAH', 10),
        ('starter', 'Starter', true, '${starterEntitlements}'::jsonb, 2, 2, 'UAH', 20),
        ('pro', 'Pro', true, '${proEntitlements}'::jsonb, 2, 2, 'UAH', 30)
    `);

    await queryRunner.query(`
      INSERT INTO "workspace_entitlements" (
        "workspace_id",
        "social_accounts_limit",
        "private_accounts_limit",
        "wishlist_enabled",
        "advanced_inventory_enabled",
        "advanced_analytics_enabled",
        "ai_credits_monthly",
        "ai_credits_used",
        "credits_reset_at"
      )
      SELECT
        w.id,
        1,
        0,
        false,
        false,
        false,
        0,
        0,
        date_trunc('month', now()) + interval '1 month'
      FROM "workspace" w
      WHERE NOT EXISTS (
        SELECT 1 FROM "workspace_entitlements" e WHERE e.workspace_id = w.id
      )
    `);

    await queryRunner.query(`
      INSERT INTO "workspace_subscriptions" (
        "workspace_id",
        "plan_template_id",
        "status",
        "entitlements_snapshot",
        "billing_cycle",
        "period_start",
        "period_end"
      )
      SELECT
        w.id,
        pt.id,
        'active',
        pt.entitlements,
        'monthly',
        date_trunc('month', now()),
        date_trunc('month', now()) + interval '1 month'
      FROM "workspace" w
      CROSS JOIN "plan_templates" pt
      WHERE pt.slug = 'free' AND pt.workspace_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "workspace_subscriptions" s
          WHERE s.workspace_id = w.id
            AND s.status IN ('trial', 'active', 'past_due')
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "subscription_changes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invoices"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plan_templates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_entitlements"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "subscription_change_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "invoice_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "workspace_subscription_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "billing_cycle_enum"`);
  }
}
