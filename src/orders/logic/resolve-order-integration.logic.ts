import type { Repository } from "typeorm";
import {
  Conversation,
  ConversationSource,
  InstagramIntegration,
  TelegramIntegration,
} from "../../database/entities";

/**
 * Resolves the concrete integration id for an order from its conversation.
 * Telegram stores `telegram_integrations.id` in `external_source_id`.
 * Instagram stores page/account id — lookup `instagram_integration` by workspace.
 */
export async function resolveIntegrationIdFromConversation(
  conversation: Conversation,
  workspaceId: number,
  deps: {
    instagramRepo: Repository<InstagramIntegration>;
    telegramRepo: Repository<TelegramIntegration>;
  },
): Promise<number | null> {
  const externalSourceId = conversation.externalSourceId?.trim();
  if (!externalSourceId) {
    return null;
  }

  if (conversation.source === ConversationSource.TELEGRAM) {
    const integrationId = Number.parseInt(externalSourceId, 10);
    if (!Number.isInteger(integrationId) || integrationId < 1) {
      return null;
    }
    const integration = await deps.telegramRepo.findOne({
      where: { id: integrationId, workspaceId },
      select: { id: true },
    });
    return integration?.id ?? null;
  }

  if (conversation.source === ConversationSource.INSTAGRAM) {
    const integration = await deps.instagramRepo.findOne({
      where: [
        { workspaceId, pageId: externalSourceId },
        { workspaceId, instagramAccountId: externalSourceId },
      ],
      select: { id: true },
    });
    return integration?.id ?? null;
  }

  return null;
}
