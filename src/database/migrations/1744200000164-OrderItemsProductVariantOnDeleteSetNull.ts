import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Allow hard-deleting catalog products/variants that appear on order lines.
 * Order history keeps snapshots; product_id / variant_id become null.
 */
export class OrderItemsProductVariantOnDeleteSetNull1744200000164
  implements MigrationInterface
{
  name = "OrderItemsProductVariantOnDeleteSetNull1744200000164";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_items"
      DROP CONSTRAINT "FK_order_items_product_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
      DROP CONSTRAINT "FK_order_items_variant_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ALTER COLUMN "product_id" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ALTER COLUMN "variant_id" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD CONSTRAINT "FK_order_items_product_id"
      FOREIGN KEY ("product_id") REFERENCES "products"("id")
      ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD CONSTRAINT "FK_order_items_variant_id"
      FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_items"
      DROP CONSTRAINT "FK_order_items_product_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
      DROP CONSTRAINT "FK_order_items_variant_id"
    `);
    await queryRunner.query(`
      DELETE FROM "order_items"
      WHERE "product_id" IS NULL OR "variant_id" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ALTER COLUMN "product_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ALTER COLUMN "variant_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD CONSTRAINT "FK_order_items_product_id"
      FOREIGN KEY ("product_id") REFERENCES "products"("id")
      ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD CONSTRAINT "FK_order_items_variant_id"
      FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
      ON DELETE RESTRICT
    `);
  }
}
