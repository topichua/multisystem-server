#!/usr/bin/env node
/**
 * Initialize inventory for most variants in a workspace.
 *
 * Usage:
 *   WORKSPACE_ID=4 COVERAGE=0.9 node scripts/seed-workspace-inventory.mjs
 *
 * Env:
 *   WORKSPACE_ID  default 4
 *   COVERAGE      fraction of uninitialized variants to stock (default 0.9)
 *   USER_ID       movement user (default: first workspace member)
 *   BATCH_SIZE    insert batch size (default 200)
 */

import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const WORKSPACE_ID = Math.max(
  1,
  parseInt(process.env.WORKSPACE_ID ?? "4", 10) || 4,
);
const COVERAGE = Math.min(
  1,
  Math.max(0, parseFloat(process.env.COVERAGE ?? "0.9") || 0.9),
);
const BATCH_SIZE = Math.max(
  1,
  parseInt(process.env.BATCH_SIZE ?? "200", 10) || 200,
);

function money(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function qtyFor(index) {
  return 5 + (index % 40) + (index % 3) * 2;
}

function purchasePriceFor(index, variantPrice) {
  const base = Number(variantPrice);
  if (Number.isFinite(base) && base > 0) {
    return money(base * 0.55);
  }
  return money(50 + (index % 20) * 10);
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const ws = await client.query(`SELECT id, name FROM workspace WHERE id = $1`, [
      WORKSPACE_ID,
    ]);
    if (!ws.rows[0]) {
      throw new Error(`Workspace ${WORKSPACE_ID} not found`);
    }

    let userId = process.env.USER_ID
      ? parseInt(process.env.USER_ID, 10)
      : null;
    if (!userId) {
      const member = await client.query(
        `SELECT user_id FROM workspace_members
         WHERE workspace_id = $1 AND status = 'active'
         ORDER BY id ASC LIMIT 1`,
        [WORKSPACE_ID],
      );
      userId = member.rows[0]?.user_id ?? null;
    }
    if (!userId) {
      throw new Error(`No active member for workspace ${WORKSPACE_ID}`);
    }

    const variants = (
      await client.query(
        `SELECT pv.id, pv.price
         FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         LEFT JOIN variant_stocks vs
           ON vs.variant_id = pv.id AND vs.workspace_id = $1
         WHERE p.workspace_id = $1
           AND (vs.id IS NULL OR vs.stock_initialized = false)
         ORDER BY pv.id ASC`,
        [WORKSPACE_ID],
      )
    ).rows;

    const targetCount = Math.floor(variants.length * COVERAGE);
    const selected = variants.slice(0, targetCount);

    console.log(
      `Workspace ${WORKSPACE_ID} (${ws.rows[0].name}): ${variants.length} uninitialized variants`,
    );
    console.log(
      `Initializing inventory for ${selected.length} variants (~${Math.round(COVERAGE * 100)}%) as user ${userId}`,
    );

    if (selected.length === 0) {
      console.log("Nothing to do.");
      return;
    }

    await client.query("BEGIN");

    let initialized = 0;
    for (let offset = 0; offset < selected.length; offset += BATCH_SIZE) {
      const batch = selected.slice(offset, offset + BATCH_SIZE);

      for (let i = 0; i < batch.length; i++) {
        const globalIndex = offset + i;
        const variant = batch[i];
        const quantity = qtyFor(globalIndex);
        const purchasePrice = purchasePriceFor(globalIndex, variant.price);
        const totalCost = money(quantity * Number(purchasePrice));

        await client.query(
          `INSERT INTO variant_stocks (
             workspace_id, variant_id, quantity, reserved_quantity,
             avg_purchase_price, total_cost, stock_initialized
           ) VALUES ($1, $2, $3, 0, $4, $5, true)
           ON CONFLICT (variant_id) DO UPDATE SET
             quantity = EXCLUDED.quantity,
             reserved_quantity = 0,
             avg_purchase_price = EXCLUDED.avg_purchase_price,
             total_cost = EXCLUDED.total_cost,
             stock_initialized = true,
             updated_at = NOW()`,
          [WORKSPACE_ID, variant.id, quantity, purchasePrice, totalCost],
        );

        await client.query(
          `INSERT INTO stock_movements (
             workspace_id, variant_id, type, quantity_change,
             purchase_price, total_cost_change, reason, comment,
             order_id, order_item_id, user_id, supply_id
           ) VALUES (
             $1, $2, 'initial_stock', $3,
             $4, $5, NULL, $6,
             NULL, NULL, $7, NULL
           )`,
          [
            WORKSPACE_ID,
            variant.id,
            quantity,
            purchasePrice,
            totalCost,
            `seed initial stock ws=${WORKSPACE_ID}`,
            userId,
          ],
        );

        initialized += 1;
      }

      console.log(`  … ${Math.min(offset + batch.length, selected.length)}/${selected.length}`);
    }

    await client.query("COMMIT");

    const stats = await client.query(
      `SELECT
         COUNT(*)::int AS stocks,
         COUNT(*) FILTER (WHERE stock_initialized)::int AS initialized,
         COALESCE(SUM(quantity), 0)::int AS total_qty
       FROM variant_stocks
       WHERE workspace_id = $1`,
      [WORKSPACE_ID],
    );

    console.log(`Done. Initialized ${initialized} variants.`);
    console.log(
      `Workspace ${WORKSPACE_ID} stocks: ${stats.rows[0].stocks} rows, ${stats.rows[0].initialized} initialized, qty sum ${stats.rows[0].total_qty}`,
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
