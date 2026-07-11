export function classifyMonobankHttpError(
  httpStatus: number,
  body: string,
): { userMessage: string } {
  const lower = body.toLowerCase();

  if (httpStatus === 401 || httpStatus === 403) {
    if (
      lower.includes("personal") ||
      lower.includes("invalid token") ||
      lower.includes("token")
    ) {
      return {
        userMessage:
          "Невірний merchant token. Використовуйте токен з web.monobank.ua (Еквайринг), а не персональний API token.",
      };
    }
    return {
      userMessage:
        "Не вдалося авторизуватися в Monobank. Перевірте merchant token.",
    };
  }

  if (httpStatus === 404) {
    return {
      userMessage: "Ресурс Monobank не знайдено. Перевірте налаштування інтеграції.",
    };
  }

  return {
    userMessage: "Не вдалося виконати запит до Monobank. Спробуйте пізніше.",
  };
}

export function sanitizeMonobankPayloadForLog(
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
