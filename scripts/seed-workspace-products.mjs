#!/usr/bin/env node
/**
 * Seed many products/variants for a workspace using its categories + characteristics.
 *
 * Usage:
 *   WORKSPACE_ID=4 COUNT=200 node scripts/seed-workspace-products.mjs
 *
 * Env:
 *   WORKSPACE_ID  default 4
 *   COUNT         products to create (default 200)
 *   USER_ID       created_by (default: first workspace member)
 */

import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const WORKSPACE_ID = Math.max(
  1,
  parseInt(process.env.WORKSPACE_ID ?? "4", 10) || 4,
);
const COUNT = Math.max(1, parseInt(process.env.COUNT ?? "200", 10) || 200);

const PRODUCT_NAMES = [
  "Рюкзак",
  "Сумка",
  "Кросівки",
  "Куртка",
  "Футболка",
  "Штани",
  "Кеди",
  "Гаманець",
  "Ремінь",
  "Шапка",
  "Шарф",
  "Пальто",
  "Сукня",
  "Сорочка",
  "Жилет",
  "Босоніжки",
  "Черевики",
  "Портфель",
  "Клач",
  "Тоут",
];

const ADJECTIVES = [
  "Класичний",
  "Міський",
  "Спортивний",
  "Преміум",
  "Легкий",
  "Зимовий",
  "Літній",
  "Шкіряний",
  "Повсякденний",
  "Трекінговий",
];

function pick(arr, i) {
  return arr[i % arr.length];
}

function money(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
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

    const categories = (
      await client.query(
        `SELECT id, name FROM product_categories
         WHERE workspace_id = $1 AND deleted_at IS NULL
         ORDER BY id ASC`,
        [WORKSPACE_ID],
      )
    ).rows;
    const categoryIds = categories.map((c) => c.id);

    const fields = (
      await client.query(
        `SELECT id, key, label, type FROM workspace_variant_custom_field
         WHERE workspace_id = $1 AND archived_at IS NULL
         ORDER BY sort_order ASC, id ASC`,
        [WORKSPACE_ID],
      )
    ).rows;

    const options = (
      await client.query(
        `SELECT id, field_id, label FROM workspace_variant_custom_field_option
         WHERE field_id = ANY($1::int[]) AND archived_at IS NULL
         ORDER BY field_id ASC, id ASC`,
        [fields.map((f) => f.id)],
      )
    ).rows;

    const optionsByField = new Map();
    for (const opt of options) {
      const list = optionsByField.get(opt.field_id) ?? [];
      list.push(opt);
      optionsByField.set(opt.field_id, list);
    }

    const colorField = fields.find((f) => f.key === "color");
    const sizeField = fields.find((f) => f.key === "size");
    const materialField = fields.find((f) => f.type === "options" && f.key !== "color" && f.key !== "size");
    const textField = fields.find((f) => f.type === "text");

    const colors = colorField ? optionsByField.get(colorField.id) ?? [] : [];
    const sizes = sizeField ? optionsByField.get(sizeField.id) ?? [] : [];
    const materials = materialField
      ? optionsByField.get(materialField.id) ?? []
      : [];

    console.log(
      `Seeding ${COUNT} products into workspace ${WORKSPACE_ID} (${ws.rows[0].name}) as user ${userId}`,
    );
    console.log(
      `Categories: ${categories.length}, colors: ${colors.length}, sizes: ${sizes.length}, materials: ${materials.length}`,
    );

    const stamp = Date.now().toString(36);
    let createdProducts = 0;
    let createdVariants = 0;

    await client.query("BEGIN");

    for (let i = 1; i <= COUNT; i++) {
      const useVariants = i % 4 !== 0; // ~75% with variants
      const name = `${pick(ADJECTIVES, i)} ${pick(PRODUCT_NAMES, i * 3)} #${i}`;
      const categoryId =
        categoryIds.length === 0
          ? null
          : i % 7 === 0
            ? null
            : pick(categoryIds, i);
      const basePrice = 199 + (i % 80) * 25 + (i % 3) * 10;
      const productType = useVariants ? "variants" : "single";

      const productRes = await client.query(
        `INSERT INTO products (
           workspace_id, category_id, name, description, status, source_type,
           price, currency, in_stock, quantity, product_type,
           created_by_user_id, updated_by_user_id
         ) VALUES (
           $1, $2, $3, $4, 'active', 'manual',
           $5, 'UAH', true, $6, $7,
           $8, $8
         ) RETURNING id`,
        [
          WORKSPACE_ID,
          categoryId,
          name.slice(0, 512),
          `Автоматично згенерований товар для навантаження (ws=${WORKSPACE_ID}, #${i}).`,
          money(basePrice),
          useVariants ? null : 20 + (i % 40),
          productType,
          userId,
        ],
      );
      const productId = productRes.rows[0].id;
      createdProducts += 1;

      const variantSpecs = [];
      if (!useVariants || (colors.length === 0 && sizes.length === 0)) {
        variantSpecs.push({ color: null, size: null, material: null, idx: 0 });
      } else {
        const colorCount = Math.min(2 + (i % 3), Math.max(1, colors.length));
        const sizeCount = Math.min(2 + (i % 4), Math.max(1, sizes.length));
        let v = 0;
        for (let ci = 0; ci < colorCount; ci++) {
          for (let si = 0; si < sizeCount; si++) {
            variantSpecs.push({
              color: colors.length ? pick(colors, i * 11 + ci) : null,
              size: sizes.length ? pick(sizes, i * 17 + si) : null,
              material:
                materials.length && (ci + si) % 2 === 0
                  ? pick(materials, i + ci)
                  : null,
              idx: v++,
            });
            if (variantSpecs.length >= 8) break;
          }
          if (variantSpecs.length >= 8) break;
        }
      }

      for (const spec of variantSpecs) {
        const sku = `WS${WORKSPACE_ID}-${stamp}-${i}-${spec.idx}`;
        const variantRes = await client.query(
          `INSERT INTO product_variants (
             product_id, price, in_stock, sku, status,
             created_by_user_id, updated_by_user_id
           ) VALUES (
             $1, $2, true, $3, 'active', $4, $4
           ) RETURNING id`,
          [productId, money(basePrice + spec.idx * 50), sku, userId],
        );
        const variantId = variantRes.rows[0].id;
        createdVariants += 1;

        const cfRows = [];
        let sortOrder = 0;
        if (colorField && spec.color) {
          cfRows.push({
            fieldId: colorField.id,
            value: spec.color.label,
            optionId: spec.color.id,
            textValue: null,
            sortOrder: sortOrder++,
          });
        }
        if (sizeField && spec.size) {
          cfRows.push({
            fieldId: sizeField.id,
            value: spec.size.label,
            optionId: spec.size.id,
            textValue: null,
            sortOrder: sortOrder++,
          });
        }
        if (materialField && spec.material) {
          cfRows.push({
            fieldId: materialField.id,
            value: spec.material.label,
            optionId: spec.material.id,
            textValue: null,
            sortOrder: sortOrder++,
          });
        }
        if (textField && i % 5 === 0) {
          cfRows.push({
            fieldId: textField.id,
            value: `seed-${i}-${spec.idx}`,
            optionId: null,
            textValue: `seed-${i}-${spec.idx}`,
            sortOrder: sortOrder++,
          });
        }

        for (const row of cfRows) {
          await client.query(
            `INSERT INTO product_variant_custom_field_value (
               variant_id, field_id, value, option_id, text_value, sort_order
             ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              variantId,
              row.fieldId,
              row.value,
              row.optionId,
              row.textValue,
              row.sortOrder,
            ],
          );
        }
      }

      if (i % 50 === 0 || i === COUNT) {
        console.log(`  … ${i}/${COUNT} products`);
      }
    }

    await client.query("COMMIT");

    const totals = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM products WHERE workspace_id = $1) AS products,
         (SELECT COUNT(*)::int FROM product_variants pv
            JOIN products p ON p.id = pv.product_id
           WHERE p.workspace_id = $1) AS variants`,
      [WORKSPACE_ID],
    );

    console.log(
      `Done. Created ${createdProducts} products, ${createdVariants} variants.`,
    );
    console.log(
      `Workspace ${WORKSPACE_ID} totals: ${totals.rows[0].products} products, ${totals.rows[0].variants} variants.`,
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
