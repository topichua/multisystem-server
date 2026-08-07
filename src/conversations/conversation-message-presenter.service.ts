import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConversationMessage } from "../database/entities";
import type { InstagramMessageDto } from "./dto/http/instagram-messages-response.dto";
import type { InstagramRepliedToMessageRefDto } from "./dto/http/instagram-messages-response.dto";
import { toLegacyInstagramMessageApiShape } from "./instagram-message-api-shape.util";
import {
  mapInstagramStoredReactionsForApi,
  mapReactionsJsonForApi,
} from "./conversation-message-reactions-json.util";
import { mapInstagramStoredAttachmentsForApi } from "./conversation-message-attachments-json.util";
import type { InstagramMessageReactionsDto } from "./dto/http/instagram-messages-response.dto";

@Injectable()
export class ConversationMessagePresenterService {
  constructor(
    @InjectRepository(ConversationMessage)
    private readonly conversationMessageRepo: Repository<ConversationMessage>,
  ) {}

  mapRowToDto(
    row: ConversationMessage,
    parentRow?: ConversationMessage | null,
  ): InstagramMessageDto {
    const base = this.parseStoredMessage(row);
    const parentId = row.repliedToExternalId?.trim();
    const withReply = !parentId
      ? base
      : {
          ...base,
          replied_to_message: parentRow
            ? this.buildRepliedToMessageRef(parentRow)
            : ({ id: parentId } satisfies InstagramRepliedToMessageRefDto),
        };
    return toLegacyInstagramMessageApiShape(withReply) as InstagramMessageDto;
  }

  async mapPersistedRowToDto(
    row: ConversationMessage,
  ): Promise<InstagramMessageDto> {
    const parentId = row.repliedToExternalId?.trim();
    if (!parentId) {
      return this.mapRowToDto(row);
    }
    const parent = await this.conversationMessageRepo.findOne({
      where: {
        workspaceId: row.workspaceId,
        conversationId: row.conversationId,
        externalId: parentId,
      },
    });
    return this.mapRowToDto(row, parent);
  }

  mapRowsToDtos(
    rows: ConversationMessage[],
    parentByExternalId?: Map<string, ConversationMessage>,
  ): InstagramMessageDto[] {
    const parents =
      parentByExternalId ??
      new Map(rows.map((r) => [r.externalId, r] as const));
    return rows.map((r) => this.mapRowToDto(r, parents.get(r.externalId)));
  }

  buildRepliedToMessageRef(
    row: ConversationMessage,
  ): InstagramRepliedToMessageRefDto {
    try {
      const parsed = JSON.parse(row.instagramJson) as InstagramMessageDto;
      if (
        typeof parsed.created_time === "string" &&
        parsed.created_time.length > 0
      ) {
        const parentAttachments = this.resolveAttachmentsForApi(
          row,
          parsed as unknown as Record<string, unknown>,
        );
        return {
          id: row.externalId,
          created_time: parsed.created_time,
          message: (parsed.message ?? row.message) || undefined,
          ...(parentAttachments != null
            ? { attachments: parentAttachments }
            : {}),
          ...(parsed.from != null ? { from: parsed.from } : {}),
        };
      }
    } catch {
      /* use row columns */
    }
    return {
      id: row.externalId,
      created_time: row.createdAt.toISOString(),
      ...(row.message.length > 0 ? { message: row.message } : {}),
    };
  }

  private resolveSystemUpdatedAtIso(row: ConversationMessage): string {
    const ts = row.systemUpdatedAt ?? row.createdAt;
    if (ts != null && !Number.isNaN(ts.getTime())) {
      return ts.toISOString();
    }
    return new Date().toISOString();
  }

  private resolveReactionsForApi(
    row: ConversationMessage,
    parsed?: Record<string, unknown>,
  ) {
    const fromColumn = mapReactionsJsonForApi(row.reactionsJson);
    if (fromColumn != null) {
      return fromColumn;
    }
    if (parsed) {
      const stored = parsed.reactions as
        | InstagramMessageReactionsDto
        | undefined;
      return mapInstagramStoredReactionsForApi(row, stored);
    }
    return undefined;
  }

  private resolveAttachmentsForApi(
    row: ConversationMessage,
    parsed?: Record<string, unknown>,
  ) {
    const stored = parsed?.attachments as
      | { data?: Array<Record<string, unknown>> }
      | undefined;
    return mapInstagramStoredAttachmentsForApi(row, stored);
  }

  private resolveDbColumnsForApi(row: ConversationMessage) {
    return {
      type: row.messageType,
    };
  }

  private parseStoredMessage(row: ConversationMessage): InstagramMessageDto {
    const dbColumns = this.resolveDbColumnsForApi(row);
    const addDbMeta = (
      m: Omit<InstagramMessageDto, "system_updated_at"> &
        Partial<Pick<InstagramMessageDto, "system_updated_at">>,
    ): InstagramMessageDto => {
      const {
        read_at,
        edited_at,
        deleted_at,
        system_updated_at,
        ...fromGraph
      } = m;
      void read_at;
      void edited_at;
      void deleted_at;
      void system_updated_at;
      return {
        ...fromGraph,
        ...dbColumns,
        ...(row.editedAt != null
          ? { edited_at: row.editedAt.toISOString() }
          : {}),
        ...(row.readAt != null ? { read_at: row.readAt.toISOString() } : {}),
        ...(row.deletedAt != null
          ? { deleted_at: row.deletedAt.toISOString() }
          : {}),
        ...(row.repliedToExternalId != null
          ? { reply_to_id: row.repliedToExternalId }
          : {}),
        system_updated_at: this.resolveSystemUpdatedAtIso(row),
      };
    };

    try {
      const parsed = JSON.parse(row.instagramJson) as Record<string, unknown>;
      const createdTime = parsed.created_time;
      if (typeof createdTime === "string" && createdTime.length > 0) {
        const {
          webhook_messaging,
          reactions: _storedReactions,
          attachments: _storedAttachments,
          conversation: _conversation,
          reply_to: _replyTo,
          ...forClient
        } = parsed;
        void webhook_messaging;
        void _storedReactions;
        void _storedAttachments;
        void _conversation;
        void _replyTo;
        const reactions = this.resolveReactionsForApi(row, parsed);
        const attachments = this.resolveAttachmentsForApi(row, parsed);
        return addDbMeta({
          ...(forClient as unknown as InstagramMessageDto),
          ...(reactions != null ? { reactions } : {}),
          ...(attachments != null ? { attachments } : {}),
          // DB columns are the source of truth for direction (webhook may correct Graph).
          from:
            row.senderId && row.senderId !== "0"
              ? { id: row.senderId }
              : undefined,
          to: {
            data:
              row.receiverId && row.receiverId !== "0"
                ? [{ id: row.receiverId }]
                : [],
          },
          id:
            typeof forClient.id === "string" && forClient.id.length > 0
              ? forClient.id
              : row.externalId,
        } as InstagramMessageDto);
      }
    } catch {
      /* fallback */
    }

    const reactions = this.resolveReactionsForApi(row);
    const attachments = this.resolveAttachmentsForApi(row);
    return addDbMeta({
      id: row.externalId,
      created_time: row.createdAt.toISOString(),
      message: row.message,
      ...(row.senderId && row.senderId !== "0"
        ? { from: { id: row.senderId } }
        : {}),
      to: {
        data:
          row.receiverId && row.receiverId !== "0"
            ? [{ id: row.receiverId }]
            : [],
      },
      ...(reactions != null ? { reactions } : {}),
      ...(attachments != null ? { attachments } : {}),
    });
  }
}
