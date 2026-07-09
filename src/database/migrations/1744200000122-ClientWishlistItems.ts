import { MigrationInterface, QueryRunner } from "typeorm";

export class ClientWishlistItems1744200000122 implements MigrationInterface {
  name = "ClientWishlistItems1744200000122";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "client_wishlist_items" (
        "id" SERIAL NOT NULL,
        "client_id" integer NOT NULL,
        "workspace_id" integer NOT NULL,
        "product_id" integer NOT NULL,
        "variant_id" integer NOT NULL,
        "at" TIMESTAMPTZ NOT NULL,
        "created_by_id" integer NOT NULL,
        "conversation_id" integer,
        CONSTRAINT "PK_client_wishlist_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_client_wishlist_items_client_product_variant"
          UNIQUE ("client_id", "product_id", "variant_id"),
        CONSTRAINT "FK_client_wishlist_items_client_id"
          FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_client_wishlist_items_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_client_wishlist_items_product_id"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_client_wishlist_items_variant_id"
          FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_client_wishlist_items_created_by_id"
          FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_client_wishlist_items_client_id"
      ON "client_wishlist_items" ("client_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_client_wishlist_items_workspace_id"
      ON "client_wishlist_items" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_client_wishlist_items_conversation_id"
      ON "client_wishlist_items" ("conversation_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "client_wishlist_items"`);
  }
}
