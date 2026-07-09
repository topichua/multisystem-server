import { MigrationInterface, QueryRunner } from "typeorm";

export class DropStockSupplyItems1744200000121 implements MigrationInterface {
  name = "DropStockSupplyItems1744200000121";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_supply_items"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "stock_supply_items" (
        "id" SERIAL NOT NULL,
        "supply_id" integer NOT NULL,
        "product_id" integer NOT NULL,
        "variant_id" integer NOT NULL,
        "quantity" integer NOT NULL,
        "buy_price" numeric(14,2) NOT NULL,
        CONSTRAINT "PK_stock_supply_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stock_supply_items_supply_id"
          FOREIGN KEY ("supply_id") REFERENCES "stock_supplies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_supply_items_product_id"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_supply_items_variant_id"
          FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_stock_supply_items_supply_id"
      ON "stock_supply_items" ("supply_id")
    `);
  }
}
