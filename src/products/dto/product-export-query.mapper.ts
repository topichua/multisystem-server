import { ProductListSort } from "./product-list-sort.enum";
import type { ListProductsQueryDto } from "./list-products-query.dto";
import type {
  CreateProductExportDto,
  ProductExportFiltersDto,
  ProductExportSortDto,
} from "./create-product-export.dto";
import { ProductExportScope } from "./create-product-export.dto";

/**
 * Maps create-export payload (filters/sort snapshot + selected ids)
 * onto the same ListProductsQueryDto shape used by GET /products.
 * Pagination fields are never set for export.
 */
export function mapExportPayloadToListQuery(input: {
  scope: string;
  filters?: ProductExportFiltersDto | Record<string, unknown> | null;
  sort?:
    | ProductListSort
    | ProductExportSortDto
    | string
    | Record<string, unknown>
    | null;
}): ListProductsQueryDto {
  if (input.scope === "selected" || input.scope === "all") {
    return {};
  }
  return filtersAndSortToListQuery(input.filters, input.sort);
}

export function filtersAndSortToListQuery(
  filters?: ProductExportFiltersDto | Record<string, unknown> | null,
  sort?: ProductListSort | ProductExportSortDto | string | Record<string, unknown> | null,
): ListProductsQueryDto {
  const f = (filters ?? {}) as ProductExportFiltersDto;
  const query: ListProductsQueryDto = {};

  const keyword =
    (typeof f.search === "string" && f.search.trim()) ||
    (typeof f.keyword === "string" && f.keyword.trim()) ||
    undefined;
  if (keyword) {
    query.keyword = keyword;
  }
  if (f.byStatus != null) {
    query.byStatus = f.byStatus;
  }
  if (f.status != null) {
    query.status = f.status;
  }
  if (Array.isArray(f.categoryIds) && f.categoryIds.length > 0) {
    query.categoryIds = f.categoryIds.map(String).join(",");
  }
  const minPrice = f.minPrice ?? f.priceFrom;
  const maxPrice = f.maxPrice ?? f.priceTo;
  if (minPrice !== undefined) {
    query.minPrice = minPrice;
  }
  if (maxPrice !== undefined) {
    query.maxPrice = maxPrice;
  }
  if (f.quantityFrom !== undefined) {
    query.quantityFrom = f.quantityFrom;
  }
  if (f.quantityTo !== undefined) {
    query.quantityTo = f.quantityTo;
  }
  if (f.wishlistOnly === true) {
    query.wishlistOnly = true;
  }
  if (f.showOnlyReserved === true) {
    query.showOnlyReserved = true;
  }
  if (Array.isArray(f.fieldFilters) && f.fieldFilters.length > 0) {
    query.fieldFilters = f.fieldFilters;
  }

  const sortEnum = resolveProductListSort(sort);
  if (sortEnum) {
    query.sort = sortEnum;
  }
  return query;
}

export function resolveProductListSort(
  sort?: ProductListSort | ProductExportSortDto | string | Record<string, unknown> | null,
): ProductListSort | undefined {
  if (sort == null) {
    return undefined;
  }
  if (typeof sort === "string") {
    if (Object.values(ProductListSort).includes(sort as ProductListSort)) {
      return sort as ProductListSort;
    }
    return undefined;
  }
  if (typeof sort === "object" && sort !== null && "field" in sort) {
    const field = String((sort as ProductExportSortDto).field ?? "")
      .toLowerCase()
      .replace(/_/g, "");
    const direction = String(
      (sort as ProductExportSortDto).direction ?? "desc",
    ).toLowerCase();
    const desc = direction !== "asc";
    if (field === "createdat" || field === "created") {
      return desc ? ProductListSort.created_desc : ProductListSort.created_asc;
    }
    if (field === "name") {
      return desc ? ProductListSort.name_desc : ProductListSort.name_asc;
    }
    if (field === "price") {
      return desc ? ProductListSort.price_desc : ProductListSort.price_asc;
    }
  }
  return undefined;
}

export function snapshotFilters(
  dto: CreateProductExportDto,
): Record<string, unknown> | null {
  if (dto.scope !== ProductExportScope.filtered) {
    return null;
  }
  if (!dto.filters || Object.keys(dto.filters).length === 0) {
    return {};
  }
  return { ...dto.filters } as Record<string, unknown>;
}

export function snapshotSort(
  dto: CreateProductExportDto,
): Record<string, unknown> | null {
  if (dto.scope !== ProductExportScope.filtered) {
    return null;
  }
  if (dto.sort == null) {
    return null;
  }
  if (typeof dto.sort === "string") {
    return { sort: dto.sort };
  }
  return { ...(dto.sort as object) } as Record<string, unknown>;
}
