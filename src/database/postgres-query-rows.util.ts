/**
 * Normalizes raw results from TypeORM `EntityManager.query` / node-pg.
 * Drivers may return row arrays directly, `[rows, rowCount]` tuples, or `{ rows }`.
 */
export function readPostgresQueryRows<T extends Record<string, unknown>>(
  result: unknown,
): T[] {
  if (result == null) {
    return [];
  }

  if (Array.isArray(result)) {
    const [first] = result;
    if (Array.isArray(first)) {
      return first as T[];
    }
    return result as T[];
  }

  if (typeof result === "object" && result !== null && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) {
      return rows as T[];
    }
  }

  return [];
}
