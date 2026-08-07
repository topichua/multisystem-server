import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from "@nestjs/common";
import {
  ProductFieldFilterMode,
  type ProductFieldFilterDto,
} from "../dto/product-field-filter.dto";

const FIELD_QUERY_KEY = /^field:(\d+)$/;

/**
 * Parses dynamic `field:{id}=...` query keys into `fieldFilters`, then removes
 * those keys so global `forbidNonWhitelisted` ValidationPipe accepts the DTO.
 *
 * **Must run before ValidationPipe** (register as a global pipe first in main.ts).
 * If ValidationPipe runs earlier, `field:36` is stripped/rejected and the filter never applies.
 *
 * - `field:12=all` → any product/variant that has field 12 set (options or text)
 * - `field:12=3,7` → options: match option ids 3 or 7
 * - `field:12=keyword` → text: case-insensitive contains
 */
@Injectable()
export class ParseProductFieldFiltersPipe implements PipeTransform {
  transform(value: unknown): unknown {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }
    const query = value as Record<string, unknown>;
    const fieldFilters: ProductFieldFilterDto[] = [];
    const keysToDelete: string[] = [];

    // Snake_case aliases → camelCase before forbidNonWhitelisted ValidationPipe.
    if (
      query.showOnlyReserved === undefined &&
      query.show_only_reserved !== undefined
    ) {
      query.showOnlyReserved = query.show_only_reserved;
    }
    if (query.show_only_reserved !== undefined) {
      keysToDelete.push("show_only_reserved");
    }
    if (
      query.quantityFrom === undefined &&
      query.quantity_from !== undefined
    ) {
      query.quantityFrom = query.quantity_from;
    }
    if (query.quantity_from !== undefined) {
      keysToDelete.push("quantity_from");
    }
    if (query.quantityTo === undefined && query.quantity_to !== undefined) {
      query.quantityTo = query.quantity_to;
    }
    if (query.quantity_to !== undefined) {
      keysToDelete.push("quantity_to");
    }

    for (const [key, raw] of Object.entries(query)) {
      const match = FIELD_QUERY_KEY.exec(key);
      if (!match) {
        continue;
      }
      keysToDelete.push(key);
      const fieldId = Number(match[1]);
      if (!Number.isInteger(fieldId) || fieldId <= 0) {
        throw new BadRequestException(`Invalid field query key: ${key}`);
      }

      const rawValues = Array.isArray(raw) ? raw : [raw];
      const joined = rawValues
        .map((v) => (v == null ? "" : String(v).trim()))
        .filter((s) => s.length > 0)
        .join(",");
      if (!joined) {
        throw new BadRequestException(
          `Query param ${key} requires a value (e.g. all, option ids, or a text keyword)`,
        );
      }

      if (joined.toLowerCase() === "all") {
        fieldFilters.push({
          fieldId,
          mode: ProductFieldFilterMode.all,
        });
        continue;
      }

      const parts = joined
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length === 0) {
        throw new BadRequestException(`Query param ${key} has no values`);
      }

      // Mode is refined in the service once field type is known:
      // options → `in` (option ids), text → `contains`.
      fieldFilters.push({
        fieldId,
        mode: ProductFieldFilterMode.in,
        values: parts,
      });
    }

    for (const key of keysToDelete) {
      delete query[key];
    }

    if (fieldFilters.length > 0) {
      const existing = query.fieldFilters;
      if (Array.isArray(existing) && existing.length > 0) {
        query.fieldFilters = [...existing, ...fieldFilters];
      } else {
        query.fieldFilters = fieldFilters;
      }
    }

    return query;
  }
}
