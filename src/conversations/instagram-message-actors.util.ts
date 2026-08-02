/**
 * Resolve Instagram DM sender/receiver.
 *
 * Webhook `sender` / `recipient` are authoritative (Graph `from`/`to` can be wrong
 * or omit the customer). `message.is_echo` marks page/business outbound copies.
 */
export function resolveInstagramMessageActors(params: {
  msg?: {
    from?: { id?: string };
    to?: { data?: Array<{ id?: string }> };
  } | null;
  businessInstagramId?: string | null;
  pageId?: string | null;
  webhook?: {
    sender?: { id?: string };
    recipient?: { id?: string };
    message?: { is_echo?: boolean };
  } | null;
}): { senderId: string; receiverId: string } {
  const myIds = new Set(
    [params.businessInstagramId, params.pageId]
      .map((x) => x?.trim())
      .filter((x): x is string => Boolean(x)),
  );
  const primaryBusinessId = [...myIds][0] ?? "";

  const webhookSender = params.webhook?.sender?.id?.trim();
  const webhookRecipient = params.webhook?.recipient?.id?.trim();
  if (webhookSender && webhookRecipient) {
    return { senderId: webhookSender, receiverId: webhookRecipient };
  }

  const fromId = params.msg?.from?.id?.trim() ?? "";
  const toId = params.msg?.to?.data?.[0]?.id?.trim() ?? "";

  if (params.webhook?.message?.is_echo === true) {
    return {
      senderId: primaryBusinessId || fromId || "0",
      receiverId:
        toId && !myIds.has(toId)
          ? toId
          : fromId && !myIds.has(fromId)
            ? fromId
            : toId || "0",
    };
  }

  if (fromId && myIds.has(fromId)) {
    return {
      senderId: fromId,
      receiverId: toId && !myIds.has(toId) ? toId : toId || "0",
    };
  }

  if (fromId && !myIds.has(fromId)) {
    return {
      senderId: fromId,
      receiverId:
        toId && myIds.has(toId) ? toId : primaryBusinessId || toId || "0",
    };
  }

  // Missing `from`: infer from `to` relative to our business ids.
  if (toId && !myIds.has(toId) && primaryBusinessId) {
    return { senderId: primaryBusinessId, receiverId: toId };
  }
  if (toId && myIds.has(toId)) {
    return { senderId: "0", receiverId: toId };
  }

  return {
    senderId: fromId || "0",
    receiverId: toId || "0",
  };
}
