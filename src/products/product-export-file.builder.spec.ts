import {
  buildCharacteristicColumns,
  buildProductExportCsv,
  buildProductExportXlsx,
  escapeCsvField,
} from "./product-export-file.builder";
import type { Product, ProductVariant } from "../database/entities";
import type { WorkspaceVariantCustomField } from "../database/entities";
import type { VariantStockDto } from "../inventory/dto/stock-response.dto";
import {
  filtersAndSortToListQuery,
  mapExportPayloadToListQuery,
  resolveProductListSort,
} from "./dto/product-export-query.mapper";
import {
  ProductExportFormat,
  ProductExportScope,
  type CreateProductExportDto,
} from "./dto/create-product-export.dto";
import { ProductListSort } from "./dto/product-list-sort.enum";
import { ProductListByStatus } from "./dto/product-list-by-status.enum";
import { ProductStatus } from "../database/entities/product-status.enum";
import ExcelJS from "exceljs";

function makeFieldDef(
  partial: Partial<WorkspaceVariantCustomField> & {
    id: number;
    key: string;
    label: string;
  },
): WorkspaceVariantCustomField {
  return {
    id: partial.id,
    workspaceId: 1,
    key: partial.key,
    label: partial.label,
    displayName: partial.displayName ?? partial.label,
    type: "text" as never,
    sortOrder: partial.sortOrder ?? partial.id,
    archivedAt: null,
    fieldOptions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as WorkspaceVariantCustomField;
}

function makeVariant(
  partial: Partial<ProductVariant> & { id: number; productId: number },
): ProductVariant {
  return {
    id: partial.id,
    productId: partial.productId,
    price: partial.price ?? 100,
    sku: partial.sku ?? `SKU-${partial.id}`,
    status: partial.status ?? ProductStatus.active,
    customFieldValues: partial.customFieldValues ?? [],
    media: partial.media ?? [],
    createdAt: partial.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: partial.updatedAt ?? new Date("2026-01-02T00:00:00.000Z"),
    inStock: true,
    createdByUserId: 1,
    updatedByUserId: null,
    product: undefined as never,
    instagramReferences: [],
    createdByUser: undefined as never,
    updatedByUser: null as never,
  } as ProductVariant;
}

function makeProduct(
  partial: Partial<Product> & { id: number; name: string },
): Product {
  return {
    id: partial.id,
    workspaceId: 1,
    name: partial.name,
    status: partial.status ?? ProductStatus.active,
    categoryId: partial.categoryId ?? null,
    category: partial.category ?? null,
    currency: partial.currency ?? "UAH",
    variants: partial.variants ?? [],
    media: [],
    createdAt: partial.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: partial.updatedAt ?? new Date("2026-01-03T00:00:00.000Z"),
    price: partial.price ?? 100,
  } as Product;
}

function stock(
  variantId: number,
  q: number,
  r: number,
  a: number,
  purchase?: number | null,
): VariantStockDto {
  return {
    variantId,
    quantity: q,
    reservedQuantity: r,
    availableQuantity: a,
    avgPurchasePrice: purchase ?? null,
  } as VariantStockDto;
}

describe("product-export-query.mapper", () => {
  it("maps nested filters and sort like list endpoint", () => {
    const q = filtersAndSortToListQuery(
      {
        search: "худі",
        categoryIds: [12],
        status: ProductStatus.active,
        priceFrom: 500,
        priceTo: 2000,
        byStatus: ProductListByStatus.onlyActive,
      },
      { field: "createdAt", direction: "desc" },
    );
    expect(q.keyword).toBe("худі");
    expect(q.categoryIds).toBe("12");
    expect(q.minPrice).toBe(500);
    expect(q.maxPrice).toBe(2000);
    expect(q.status).toBe(ProductStatus.active);
    expect(q.byStatus).toBe(ProductListByStatus.onlyActive);
    expect(q.sort).toBe(ProductListSort.created_desc);
    expect(q.page).toBeUndefined();
    expect(q.limit).toBeUndefined();
  });

  it("selected and all scopes ignore filters mapping", () => {
    const dto: CreateProductExportDto = {
      scope: ProductExportScope.selected,
      format: ProductExportFormat.xlsx,
      filters: { search: "x" },
      productIds: [1],
    };
    expect(mapExportPayloadToListQuery(dto)).toEqual({});
    expect(
      mapExportPayloadToListQuery({
        scope: ProductExportScope.all,
        format: ProductExportFormat.csv,
        filters: { search: "y" },
      }),
    ).toEqual({});
  });

  it("resolves list sort enums", () => {
    expect(resolveProductListSort("name_asc")).toBe(ProductListSort.name_asc);
    expect(resolveProductListSort({ field: "price", direction: "asc" })).toBe(
      ProductListSort.price_asc,
    );
  });
});

describe("escapeCsvField", () => {
  it("escapes quotes, semicolons and newlines", () => {
    expect(escapeCsvField("a;b")).toBe('"a;b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvField("plain")).toBe("plain");
  });
});

describe("buildProductExportCsv", () => {
  it("emits UTF-8 BOM, semicolon delimiter, dynamic characteristics", async () => {
    const color = makeFieldDef({ id: 1, key: "color", label: "Колір" });
    const size = makeFieldDef({ id: 2, key: "size", label: "Розмір" });
    const v1 = makeVariant({
      id: 10,
      productId: 1,
      sku: "A-1",
      price: 199.5,
      customFieldValues: [
        {
          id: 1,
          fieldId: 1,
          value: "Червоний",
          textValue: null,
          sortOrder: 0,
        } as never,
      ],
    });
    const v2 = makeVariant({
      id: 11,
      productId: 1,
      sku: "A-2",
      customFieldValues: [
        {
          id: 2,
          fieldId: 2,
          value: "M",
          textValue: null,
          sortOrder: 0,
        } as never,
      ],
    });
    const product = makeProduct({
      id: 1,
      name: 'Худі; "Premium"',
      categoryId: 5,
      variants: [v1, v2],
    });
    const stockMap = new Map([
      [10, stock(10, 5, 1, 4, 50)],
      [11, stock(11, 2, 0, 2, 40)],
    ]);
    const result = buildProductExportCsv({
      products: [product],
      categoriesById: new Map([[5, "Одяг"]]),
      fieldDefs: [color, size],
      stockMap,
      productImageById: new Map([[1, "https://img/p1.jpg"]]),
      includePurchasePrice: true,
      format: "csv",
      fileName: "products-export-test.csv",
    });

    const text = result.buffer.toString("utf8");
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const body = text.slice(1);
    const lines = body.split("\n");
    expect(lines[0]).toContain("ID товару");
    expect(lines[0]).toContain("Закупівельна ціна");
    expect(lines[0]).toContain("Колір");
    expect(lines[0]).toContain("Розмір");
    expect(lines[0].split(";").length).toBeGreaterThan(10);
    expect(lines.length).toBe(3); // header + 2 variants
    expect(lines[1]).toContain("10");
    expect(lines[1]).toContain("A-1");
    expect(lines[1]).toContain('"Худі; ""Premium"""');
    // empty size on first variant still present as empty field
  });

  it("omits purchase price column when not permitted", () => {
    const product = makeProduct({
      id: 1,
      name: "P",
      variants: [makeVariant({ id: 1, productId: 1 })],
    });
    const result = buildProductExportCsv({
      products: [product],
      categoriesById: new Map(),
      fieldDefs: [],
      stockMap: new Map([[1, stock(1, 1, 0, 1)]]),
      productImageById: new Map(),
      includePurchasePrice: false,
      format: "csv",
      fileName: "x.csv",
    });
    const header = result.buffer.toString("utf8").slice(1).split("\n")[0];
    expect(header).not.toContain("Закупівельна ціна");
  });
});

describe("buildProductExportXlsx", () => {
  it("builds two sheets with bold headers and aggregates", async () => {
    const color = makeFieldDef({ id: 1, key: "color", label: "Колір" });
    const v1 = makeVariant({
      id: 10,
      productId: 1,
      price: 100,
      customFieldValues: [
        {
          id: 1,
          fieldId: 1,
          value: "Blue",
          textValue: null,
          sortOrder: 0,
        } as never,
      ],
    });
    const v2 = makeVariant({
      id: 11,
      productId: 1,
      price: 200,
      status: ProductStatus.active,
      customFieldValues: [],
    });
    const product = makeProduct({
      id: 1,
      name: "Товар",
      categoryId: 3,
      variants: [v1, v2],
    });
    const empty = makeProduct({
      id: 2,
      name: "Без варіантів",
      variants: [],
    });
    const stockMap = new Map([
      [10, stock(10, 3, 1, 2)],
      [11, stock(11, 7, 2, 5)],
    ]);

    const file = await buildProductExportXlsx({
      products: [product, empty],
      categoriesById: new Map([[3, "Cat"]]),
      fieldDefs: [color],
      stockMap,
      productImageById: new Map(),
      includePurchasePrice: false,
      format: "xlsx",
      fileName: "products-export.xlsx",
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.buffer);
    expect(wb.worksheets.map((s) => s.name)).toEqual(["Товари", "Варіанти"]);

    const productsSheet = wb.getWorksheet("Товари")!;
    expect(productsSheet.getRow(1).getCell(1).value).toBe("ID товару");
    expect(productsSheet.getRow(1).font?.bold).toBe(true);
    expect(productsSheet.rowCount).toBe(3); // header + 2 products
    // product aggregates: qty 10, reserved 3, available 7, min 100, max 200
    expect(productsSheet.getRow(2).getCell(4).value).toBe(2); // variants count
    expect(productsSheet.getRow(2).getCell(5).value).toBe(100);
    expect(productsSheet.getRow(2).getCell(6).value).toBe(200);
    expect(productsSheet.getRow(2).getCell(7).value).toBe(10);
    expect(productsSheet.getRow(2).getCell(8).value).toBe(3);
    expect(productsSheet.getRow(2).getCell(9).value).toBe(7);
    // empty product
    expect(productsSheet.getRow(3).getCell(4).value).toBe(0);
    expect(productsSheet.getRow(3).getCell(5).value).toBeNull();

    const variantsSheet = wb.getWorksheet("Варіанти")!;
    const header = variantsSheet.getRow(1);
    const headers: string[] = [];
    header.eachCell((c) => headers.push(String(c.value)));
    expect(headers).toContain("ID варіанта");
    expect(headers).toContain("SKU");
    expect(headers).toContain("Колір");
    expect(headers).not.toContain("Закупівельна ціна");
    expect(variantsSheet.rowCount).toBe(3); // header + 2 variants
    expect(variantsSheet.getRow(2).getCell(3).value).toBe(10);
    // empty color on v2
    const colorCol = headers.indexOf("Колір") + 1;
    expect(variantsSheet.getRow(3).getCell(colorCol).value).toBe("");
  });
});

describe("buildCharacteristicColumns", () => {
  it("unions only used characteristics", () => {
    const a = makeFieldDef({ id: 1, key: "a", label: "A", sortOrder: 2 });
    const b = makeFieldDef({ id: 2, key: "b", label: "B", sortOrder: 1 });
    const unused = makeFieldDef({
      id: 3,
      key: "c",
      label: "C",
      sortOrder: 0,
    });
    const product = makeProduct({
      id: 1,
      name: "P",
      variants: [
        makeVariant({
          id: 1,
          productId: 1,
          customFieldValues: [
            {
              id: 1,
              fieldId: 1,
              value: "x",
              textValue: null,
              sortOrder: 0,
            } as never,
          ],
        }),
        makeVariant({
          id: 2,
          productId: 1,
          customFieldValues: [
            {
              id: 2,
              fieldId: 2,
              value: "y",
              textValue: null,
              sortOrder: 0,
            } as never,
          ],
        }),
      ],
    });
    const cols = buildCharacteristicColumns([product], [a, b, unused]);
    expect(cols.map((c) => c.id)).toEqual([2, 1]);
  });
});
