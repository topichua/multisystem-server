import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductSuggestions1744200000072 implements MigrationInterface {
  name = "ProductSuggestions1744200000072";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_suggestions" (
        "id" SERIAL NOT NULL,
        "product_id" integer NOT NULL,
        "product_variant_id" integer,
        "conversation_id" integer NOT NULL,
        "post_id" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_suggestions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_suggestions_product_id"
          FOREIGN KEY ("product_id") REFERENCES "products"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_product_suggestions_product_variant_id"
          FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_product_suggestions_conversation_id"
          FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_product_suggestions_conversation_id" ON "product_suggestions" ("conversation_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_suggestions_product_id" ON "product_suggestions" ("product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_suggestions_product_variant_id" ON "product_suggestions" ("product_variant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_suggestions_post_id" ON "product_suggestions" ("post_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_suggestions"`);
  }
}
