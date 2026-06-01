#!/usr/bin/env node
/**
 * Bulk-create products via POST /products for load / list testing.
 *
 * Usage:
 *   node scripts/seed-products-load-test.mjs
 *
 * Env:
 *   BASE_URL          default http://localhost:3000
 *   JWT               bearer token (skip login if set)
 *   EMAIL + PASSWORD  login via POST /auth/login (if JWT unset)
 *   COUNT             products to create (default 100)
 *   CONCURRENCY       parallel requests (default 10)
 *   PRODUCT_TYPE      single | variants (default single)
 *   VARIANTS_PER      variants per product when PRODUCT_TYPE=variants (default 2)
 *   STATUS            draft | active | archived (default active)
 *   NAME_PREFIX       default "Load test"
 *
 * Examples:
 *   COUNT=500 CONCURRENCY=20 node scripts/seed-products-load-test.mjs
 *   JWT=eyJ... COUNT=50 node scripts/seed-products-load-test.mjs
 *   EMAIL=you@x.com PASSWORD=secret COUNT=200 PRODUCT_TYPE=variants VARIANTS_PER=3 node scripts/seed-products-load-test.mjs
 */

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const COUNT = Math.max(1, parseInt(process.env.COUNT ?? "100", 10) || 100);
const CONCURRENCY = Math.max(
  1,
  parseInt(process.env.CONCURRENCY ?? "10", 10) || 10,
);
const PRODUCT_TYPE = process.env.PRODUCT_TYPE === "variants" ? "variants" : "single";
const VARIANTS_PER = Math.max(
  1,
  parseInt(process.env.VARIANTS_PER ?? "2", 10) || 2,
);
const STATUS = process.env.STATUS ?? "active";
const NAME_PREFIX = process.env.NAME_PREFIX ?? "Load test";

async function login() {
  const email = process.env.EMAIL?.trim();
  const password = process.env.PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Set JWT, or EMAIL and PASSWORD for POST /auth/login",
    );
  }
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Login failed ${res.status}: ${body}`);
  }
  const data = JSON.parse(body);
  if (!data.access_token) {
    throw new Error("Login response missing access_token");
  }
  return data.access_token;
}

function buildProductBody(index) {
  const price = 10 + (index % 500) + 0.99;
  const body = {
    name: `${NAME_PREFIX} #${index}`,
    description: `Auto-generated for load testing (index ${index}).`,
    productType: PRODUCT_TYPE,
    status: STATUS,
    price,
    currency: "UAH",
    inStock: true,
    quantity: 100 + (index % 50),
  };

  if (PRODUCT_TYPE === "variants") {
    body.variants = [];
    for (let v = 0; v < VARIANTS_PER; v++) {
      body.variants.push({
        price: price + v,
        inStock: true,
        quantity: 50 + v,
        sku: `LT-${index}-${v}`,
        status: STATUS,
        customFields: [],
      });
    }
  }

  return body;
}

async function createProduct(token, index) {
  const res = await fetch(`${BASE_URL}/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(buildProductBody(index)),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /products #${index} → ${res.status}: ${text}`);
  }
}

async function runPool(token, total, concurrency, worker) {
  let next = 1;
  let ok = 0;
  let fail = 0;
  const errors = [];

  async function runOne() {
    while (true) {
      const i = next++;
      if (i > total) return;
      try {
        await worker(token, i);
        ok++;
      } catch (err) {
        fail++;
        if (errors.length < 10) {
          errors.push(err instanceof Error ? err.message : String(err));
        }
      }
      if ((ok + fail) % 50 === 0 || ok + fail === total) {
        process.stdout.write(
          `\r  progress: ${ok + fail}/${total} (ok ${ok}, fail ${fail})`,
        );
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => runOne());
  await Promise.all(workers);
  process.stdout.write("\n");
  return { ok, fail, errors };
}

async function main() {
  console.log("Product load-test seeder");
  console.log(`  BASE_URL:     ${BASE_URL}`);
  console.log(`  COUNT:        ${COUNT}`);
  console.log(`  CONCURRENCY:  ${CONCURRENCY}`);
  console.log(`  PRODUCT_TYPE: ${PRODUCT_TYPE}`);
  if (PRODUCT_TYPE === "variants") {
    console.log(`  VARIANTS_PER: ${VARIANTS_PER}`);
  }
  console.log(`  STATUS:       ${STATUS}`);

  const token = process.env.JWT?.trim() || (await login());
  console.log("  Auth:         ok\n");

  const started = Date.now();
  const { ok, fail, errors } = await runPool(
    token,
    COUNT,
    CONCURRENCY,
    createProduct,
  );
  const elapsedSec = ((Date.now() - started) / 1000).toFixed(2);

  console.log(`Done in ${elapsedSec}s`);
  console.log(`  Created:  ${ok}`);
  console.log(`  Failed:   ${fail}`);
  if (fail > 0) {
    console.log("  Sample errors:");
    for (const e of errors) {
      console.log(`    - ${e}`);
    }
    process.exit(1);
  }
  console.log(
    `\nVerify: GET ${BASE_URL}/products?page=1&pageSize=50 (with same JWT)`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
