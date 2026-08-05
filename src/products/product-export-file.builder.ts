import ExcelJS from "exceljs";
import type { Product, ProductVariant } from "../database/entities";
import type { WorkspaceVariantCustomField } from "../database/entities";
import type { VariantStockDto } from "../inventory/dto/stock-response.dto";
import { presentProductStockFields } from "../inventory/inventory-quantity.util";
import {
  buildVariantTitleFromFields,
  serializeVariantCustomFields,
} from "../variant-custom-fields/variant-custom-fields.util";
import { pickMainMediaUrl } from "./product-media.util";

export type ProductExportBuildInput = {
  products: Product[];
  categoriesById: Map<number, string>;
  fieldDefs: WorkspaceVariantCustomField[];
  stockMap: Map<number, VariantStockDto>;
  productImageById: Map<number, string>;
  includePurchasePrice: boolean;
  format: "xlsx" | "csv";
  fileName: string;
};

export type ProductExportFileResult = {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  variantCount: number;
};

function num(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(Number(v))) return null;
  return Number(v);
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString();
}

function productStatusLabel(status: string): string {
  return status;
}

function activeVariantPrices(variants: ProductVariant[]): number[] {
  return variants
    .filter((v) => v.status !== "archived")
    .map((v) => v.price)
    .filter((p): p is number => p != null && !Number.isNaN(Number(p)))
    .map(Number);
}

export function countVariants(products: Product[]): number {
  return products.reduce((n, p) => n + (p.variants?.length ?? 0), 0);
}

export function buildCharacteristicColumns(
  products: Product[],
  fieldDefs: WorkspaceVariantCustomField[],
): WorkspaceVariantCustomField[] {
  const usedFieldIds = new Set<number>();
  for (const p of products) {
    for (const v of p.variants ?? []) {
      for (const cf of v.customFieldValues ?? []) {
        if (cf.value && cf.value.trim()) {
          usedFieldIds.add(cf.fieldId);
        }
      }
    }
  }
  return fieldDefs
    .filter((d) => usedFieldIds.has(d.id))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

function characteristicHeader(def: WorkspaceVariantCustomField): string {
  return (def.displayName?.trim() || def.label?.trim() || def.key).trim();
}

function variantFieldValue(
  variant: ProductVariant,
  fieldId: number,
  fieldDefs: WorkspaceVariantCustomField[],
): string {
  const serialized = serializeVariantCustomFields(variant, fieldDefs);
  const hit = serialized.find((s) => s.fieldId === fieldId);
  return hit?.value?.trim() || "";
}

function productAggregates(
  product: Product,
  stockMap: Map<number, VariantStockDto>,
): {
  variantCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
} {
  const variants = product.variants ?? [];
  let totalQuantity = 0;
  let reservedQuantity = 0;
  let availableQuantity = 0;
  for (const v of variants) {
    const stock = stockMap.get(v.id);
    if (!stock) continue;
    const fields = presentProductStockFields(stock);
    totalQuantity += fields.quantity ?? 0;
    reservedQuantity += fields.reservedQuantity ?? 0;
    availableQuantity += fields.availableQuantity ?? 0;
  }
  const prices = activeVariantPrices(variants);
  return {
    variantCount: variants.length,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    totalQuantity,
    reservedQuantity,
    availableQuantity,
  };
}

/** CSV: UTF-8 BOM, delimiter `;`, RFC-style escaping. */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[;"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildProductExportCsv(
  input: ProductExportBuildInput,
): ProductExportFileResult {
  const charCols = buildCharacteristicColumns(input.products, input.fieldDefs);
  const headers = [
    "ID товару",
    "Назва товару",
    "ID варіанта",
    "Назва варіанта",
    "SKU",
    "Категорія",
    "Ціна",
    ...(input.includePurchasePrice ? ["Закупівельна ціна"] : []),
    "Валюта",
    "Загальна кількість",
    "Зарезервовано",
    "Доступно",
    "Статус товару",
    "Статус варіанта",
    "URL зображення товару",
    "URL зображення варіанта",
    "Дата створення",
    "Дата оновлення",
    ...charCols.map(characteristicHeader),
  ];

  const lines: string[] = [headers.map(escapeCsvField).join(";")];
  let variantCount = 0;

  for (const product of input.products) {
    const variants = product.variants ?? [];
    if (variants.length === 0) {
      continue;
    }
    const category =
      (product.categoryId != null
        ? input.categoriesById.get(product.categoryId)
        : null) || "";
    const productImage = input.productImageById.get(product.id) || "";
    for (const variant of variants) {
      variantCount += 1;
      const title = buildVariantTitleFromFields(input.fieldDefs, variant);
      const stock = input.stockMap.get(variant.id);
      const fields = stock
        ? presentProductStockFields(stock)
        : {
            quantity: 0,
            reservedQuantity: 0,
            availableQuantity: 0,
            avgPurchasePrice: null as number | null,
          };
      const variantImage = pickMainMediaUrl(variant.media ?? []) || "";
      const row: Array<string | number | null> = [
        product.id,
        product.name,
        variant.id,
        title,
        variant.sku ?? "",
        category,
        num(variant.price),
        ...(input.includePurchasePrice
          ? [num(fields.avgPurchasePrice)]
          : []),
        product.currency ?? "UAH",
        fields.quantity ?? 0,
        fields.reservedQuantity ?? 0,
        fields.availableQuantity ?? 0,
        productStatusLabel(product.status),
        productStatusLabel(variant.status),
        productImage,
        variantImage,
        formatDate(variant.createdAt),
        formatDate(variant.updatedAt),
        ...charCols.map((c) =>
          variantFieldValue(variant, c.id, input.fieldDefs),
        ),
      ];
      lines.push(row.map(escapeCsvField).join(";"));
    }
  }

  const bom = "\uFEFF";
  const buffer = Buffer.from(bom + lines.join("\n"), "utf8");
  return {
    buffer,
    contentType: "text/csv; charset=utf-8",
    fileName: input.fileName,
    variantCount,
  };
}

export async function buildProductExportXlsx(
  input: ProductExportBuildInput,
): Promise<ProductExportFileResult> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Multi-Sale";
  workbook.created = new Date();

  const productsSheet = workbook.addWorksheet("Товари", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const productHeaders = [
    "ID товару",
    "Назва",
    "Категорія",
    "Кількість варіантів",
    "Мінімальна ціна",
    "Максимальна ціна",
    "Загальна кількість",
    "Зарезервовано",
    "Доступно",
    "Статус",
    "Дата створення",
    "Дата оновлення",
  ];
  productsSheet.addRow(productHeaders);
  styleHeaderRow(productsSheet);

  for (const product of input.products) {
    const agg = productAggregates(product, input.stockMap);
    const category =
      (product.categoryId != null
        ? input.categoriesById.get(product.categoryId)
        : null) || "";
    productsSheet.addRow([
      product.id,
      product.name,
      category,
      agg.variantCount,
      agg.minPrice,
      agg.maxPrice,
      agg.totalQuantity,
      agg.reservedQuantity,
      agg.availableQuantity,
      productStatusLabel(product.status),
      product.createdAt,
      product.updatedAt,
    ]);
  }
  autoWidth(productsSheet);
  productsSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: productHeaders.length },
  };

  const variantsSheet = workbook.addWorksheet("Варіанти", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const charCols = buildCharacteristicColumns(input.products, input.fieldDefs);
  const variantHeaders = [
    "ID товару",
    "Назва товару",
    "ID варіанта",
    "Назва варіанта",
    "SKU",
    "Категорія",
    "Ціна",
    ...(input.includePurchasePrice ? ["Закупівельна ціна"] : []),
    "Валюта",
    "Загальна кількість",
    "Зарезервовано",
    "Доступно",
    "Статус товару",
    "Статус варіанта",
    "URL зображення товару",
    "URL зображення варіанта",
    "Дата створення",
    "Дата оновлення",
    ...charCols.map(characteristicHeader),
  ];
  variantsSheet.addRow(variantHeaders);
  styleHeaderRow(variantsSheet);

  let variantCount = 0;
  for (const product of input.products) {
    const category =
      (product.categoryId != null
        ? input.categoriesById.get(product.categoryId)
        : null) || "";
    const productImage = input.productImageById.get(product.id) || "";
    for (const variant of product.variants ?? []) {
      variantCount += 1;
      const title = buildVariantTitleFromFields(input.fieldDefs, variant);
      const stock = input.stockMap.get(variant.id);
      const fields = stock
        ? presentProductStockFields(stock)
        : {
            quantity: 0,
            reservedQuantity: 0,
            availableQuantity: 0,
            avgPurchasePrice: null as number | null,
          };
      const variantImage = pickMainMediaUrl(variant.media ?? []) || "";
      variantsSheet.addRow([
        product.id,
        product.name,
        variant.id,
        title,
        variant.sku ?? "",
        category,
        num(variant.price),
        ...(input.includePurchasePrice
          ? [num(fields.avgPurchasePrice)]
          : []),
        product.currency ?? "UAH",
        fields.quantity ?? 0,
        fields.reservedQuantity ?? 0,
        fields.availableQuantity ?? 0,
        productStatusLabel(product.status),
        productStatusLabel(variant.status),
        productImage,
        variantImage,
        variant.createdAt,
        variant.updatedAt,
        ...charCols.map((c) =>
          variantFieldValue(variant, c.id, input.fieldDefs),
        ),
      ]);
    }
  }
  autoWidth(variantsSheet);
  variantsSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: variantHeaders.length },
  };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return {
    buffer,
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileName: input.fileName,
    variantCount,
  };
}

function styleHeaderRow(sheet: ExcelJS.Worksheet): void {
  const row = sheet.getRow(1);
  row.font = { bold: true };
  row.commit();
}

function autoWidth(sheet: ExcelJS.Worksheet): void {
  sheet.columns.forEach((col) => {
    let max = 12;
    col.eachCell?.({ includeEmpty: true }, (cell) => {
      const len = cell.value == null ? 0 : String(cell.value).length;
      if (len > max) max = Math.min(len + 2, 48);
    });
    col.width = max;
  });
}

export async function buildProductExportFile(
  input: ProductExportBuildInput,
): Promise<ProductExportFileResult> {
  if (input.format === "csv") {
    return buildProductExportCsv(input);
  }
  return buildProductExportXlsx(input);
}
