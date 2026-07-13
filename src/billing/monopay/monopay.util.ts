/** Mask secret for logs — first/last 4 chars only. */
export function maskSecret(value: string | undefined | null): string {
  if (!value?.trim()) {
    return "(not set)";
  }
  const v = value.trim();
  if (v.length <= 8) {
    return "****";
  }
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

export type MonopayAuthMode = "acquiring_x_token" | "oauth_not_supported";

export type MonopayApiErrorKind =
  | "missing_token"
  | "invalid_merchant_token"
  | "personal_token_rejected"
  | "forbidden"
  | "merchant_not_found"
  | "network"
  | "unknown";

export function classifyMonopayHttpError(
  httpStatus: number,
  body: string,
): { kind: MonopayApiErrorKind; hint: string } {
  const lower = body.toLowerCase();

  if (httpStatus === 401 || httpStatus === 403) {
    if (
      lower.includes("personal") ||
      lower.includes("invalid token") ||
      lower.includes("token")
    ) {
      return {
        kind: "personal_token_rejected",
        hint:
          "Mono rejected the token. Use Merchant X-Token from https://web.monobank.ua/ (Інтернет → Еквайринг → Токен). " +
          "Personal API token from https://api.monobank.ua/index.html does NOT work for /api/merchant/*.",
      };
    }
    if (lower.includes("merchant") || lower.includes("not found")) {
      return {
        kind: "merchant_not_found",
        hint: "Merchant not found for this token. Confirm acquiring is enabled in Mono Business and the X-Token is from the merchant portal.",
      };
    }
    return {
      kind: "invalid_merchant_token",
      hint: "Unauthorized (401/403). Use Merchant acquiring X-Token, not Personal API token from api.monobank.ua.",
    };
  }

  if (httpStatus === 404) {
    return {
      kind: "merchant_not_found",
      hint: "Endpoint or merchant resource not found. Check MONOPAY_API_BASE_URL and token type.",
    };
  }

  return {
    kind: "unknown",
    hint: body.slice(0, 300) || `HTTP ${httpStatus}`,
  };
}

export function sanitizeMonopayPayloadForLog(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    invoiceId: payload.invoiceId,
    status: payload.status,
    amount: payload.amount,
    finalAmount: payload.finalAmount,
    ccy: payload.ccy,
    reference: payload.reference,
    modifiedDate: payload.modifiedDate,
    failureReason: payload.failureReason,
    errCode: payload.errCode,
  };
}
