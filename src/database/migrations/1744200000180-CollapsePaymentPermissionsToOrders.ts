import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Drop granular payments.* role keys.
 * Roles that had any payments.* permission keep access via orders.payments.manage.
 */
export class CollapsePaymentPermissionsToOrders1744200000180
  implements MigrationInterface
{
  name = "CollapsePaymentPermissionsToOrders1744200000180";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "workspace_roles"
      SET "permissions" = (
        SELECT COALESCE(jsonb_agg(DISTINCT permission ORDER BY permission), '[]'::jsonb)
        FROM jsonb_array_elements_text(
          COALESCE("permissions", '[]'::jsonb)
          || CASE
            WHEN COALESCE("permissions", '[]'::jsonb) ?| ARRAY[
              'payments.integrations.view',
              'payments.integrations.manage',
              'payments.links.create',
              'payments.links.cancel',
              'payments.view',
              'payments.manual.create',
              'payments.manual_methods.view',
              'payments.manual_methods.manage'
            ]
              THEN '["orders.payments.manage"]'::jsonb
            ELSE '[]'::jsonb
          END
        ) AS permission
        WHERE permission NOT IN (
          'payments.integrations.view',
          'payments.integrations.manage',
          'payments.links.create',
          'payments.links.cancel',
          'payments.view',
          'payments.manual.create',
          'payments.manual_methods.view',
          'payments.manual_methods.manage'
        )
      )
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Granular keys cannot be restored.
  }
}
