export type OrdersKeywordClause = {
  whereClause: string;
  params: Record<string, unknown>;
};

function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function buildOrdersKeywordClause(
  keyword?: string | null,
): OrdersKeywordClause | null {
  const normalizedKeyword = typeof keyword === "string" ? keyword.trim() : "";
  if (normalizedKeyword.length === 0) {
    return null;
  }

  const keywordPattern = `%${escapeIlikePattern(normalizedKeyword)}%`;
  const params: Record<string, unknown> = { keywordPattern };
  const predicates = [
    "customer.firstName ILIKE :keywordPattern ESCAPE '\\'",
    "customer.lastName ILIKE :keywordPattern ESCAPE '\\'",
    "customer.phone ILIKE :keywordPattern ESCAPE '\\'",
    "delivery.trackingNumber ILIKE :keywordPattern ESCAPE '\\'",
  ];

  const parsedOrderId = /^\d+$/.test(normalizedKeyword)
    ? Number.parseInt(normalizedKeyword, 10)
    : null;
  if (parsedOrderId != null && parsedOrderId > 0) {
    predicates.push("o.id = :orderId");
    params.orderId = parsedOrderId;
  }

  return {
    whereClause: `(${predicates.join(" OR ")})`,
    params,
  };
}
