import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * New product and client rows receive ids starting at 1000 (or max(id)+1 if already higher).
 * Existing rows are left unchanged (FKs). Access control remains workspace-scoped.
 */
export class ProductAndClientIdStart10001744200000179
  implements MigrationInterface
{
  name = "ProductAndClientIdStart10001744200000179";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // nextval returns setval_value + 1 when is_called=true (default).
    // GREATEST(999, max) → empty table next id = 1000; max=50 → next=1000; max=1500 → next=1501.
    await queryRunner.query(`
      DO $$
      DECLARE
        seq_name text;
        max_id bigint;
      BEGIN
        -- products
        seq_name := pg_get_serial_sequence('products', 'id');
        IF seq_name IS NOT NULL THEN
          SELECT COALESCE(MAX(id), 0) INTO max_id FROM products;
          PERFORM setval(seq_name, GREATEST(999, max_id), true);
        END IF;

        -- clients
        seq_name := pg_get_serial_sequence('clients', 'id');
        IF seq_name IS NOT NULL THEN
          SELECT COALESCE(MAX(id), 0) INTO max_id FROM clients;
          PERFORM setval(seq_name, GREATEST(999, max_id), true);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Irreversible for production data; only re-sync sequences to current max(id).
    await queryRunner.query(`
      DO $$
      DECLARE
        seq_name text;
        max_id bigint;
      BEGIN
        seq_name := pg_get_serial_sequence('products', 'id');
        IF seq_name IS NOT NULL THEN
          SELECT COALESCE(MAX(id), 0) INTO max_id FROM products;
          IF max_id > 0 THEN
            PERFORM setval(seq_name, max_id, true);
          END IF;
        END IF;

        seq_name := pg_get_serial_sequence('clients', 'id');
        IF seq_name IS NOT NULL THEN
          SELECT COALESCE(MAX(id), 0) INTO max_id FROM clients;
          IF max_id > 0 THEN
            PERFORM setval(seq_name, max_id, true);
          END IF;
        END IF;
      END $$;
    `);
  }
}
