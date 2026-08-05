import type { ListOrdersQueryDto } from "./list-orders-query.dto";
import type {
  CreateOrderExportDto,
  OrderExportFiltersDto,
} from "./create-order-export.dto";

/**
 * Builds the same ListOrdersQueryDto shape used by GET /orders
 * (pagination fields omitted for export).
 */
export function mapOrderExportToListQuery(
  dto: CreateOrderExportDto,
): ListOrdersQueryDto {
  const nested = dto.filters ?? {};
  const g = <K extends keyof OrderExportFiltersDto>(
    key: K,
  ): OrderExportFiltersDto[K] | undefined =>
    (nested[key] as OrderExportFiltersDto[K] | undefined) ??
    (dto[key as keyof CreateOrderExportDto] as
      | OrderExportFiltersDto[K]
      | undefined);

  const query: ListOrdersQueryDto = {};
  const keyword = g("keyword")?.toString().trim() || g("search")?.toString().trim();
  if (keyword) query.keyword = keyword;

  const statusId = g("statusId");
  if (statusId != null) query.statusId = statusId;

  const statuses = g("statuses");
  if (Array.isArray(statuses) && statuses.length > 0) {
    query.statuses = statuses;
  }

  const clientId = g("clientId");
  if (clientId != null) query.clientId = clientId;

  const createdFrom = g("createdFrom") || g("createdAtFrom");
  if (createdFrom) query.createdFrom = createdFrom;

  const createdTo = g("createdTo") || g("createdAtTo");
  if (createdTo) query.createdTo = createdTo;

  const totalFrom = g("totalPriceFrom") ?? g("totalFrom");
  if (totalFrom != null) query.totalPriceFrom = totalFrom;

  const totalTo = g("totalPriceTo") ?? g("totalTo");
  if (totalTo != null) query.totalPriceTo = totalTo;

  const sources = g("sources");
  if (Array.isArray(sources) && sources.length > 0) {
    query.sources = sources;
  }

  return query;
}

export function snapshotOrderExportFilters(
  dto: CreateOrderExportDto,
): Record<string, unknown> {
  const list = mapOrderExportToListQuery(dto) as Record<string, unknown>;
  // Drop undefined values for a clean snapshot
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(list)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
