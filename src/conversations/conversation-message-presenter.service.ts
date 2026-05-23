import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConversationMessage } from "../database/entities";
import type { InstagramMessageDto } from "./dto/http/instagram-messages-response.dto";
import type { InstagramRepliedToMessageRefDto } from "./dto/http/instagram-messages-response.dto";

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
    if (!parentId) {
      return base;
    }
    const replied_to_message: InstagramRepliedToMessageRefDto = parentRow
      ? this.buildRepliedToMessageRef(parentRow)
      : { id: parentId };
    return { ...base, replied_to_message };
  }

  async mapPersistedRowToDto(
    row: ConversationMessage,
  ): Promise<InstagramMessageDto> {
    const parentId = row.repliedToExternalId?.trim();
    if (!parentId) {
      return this.mapRowToDto(row);
    }
    const parent = await this.conversationMessageRepo.findOne({
      where: { conversationId: row.conversationId, externalId: parentId },
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
        return {
          id: row.externalId,
          created_time: parsed.created_time,
          message: (parsed.message ?? row.message) || undefined,
          ...(parsed.attachments != null
            ? { attachments: parsed.attachments }
            : {}),
          ...(parsed.shares != null ? { shares: parsed.shares } : {}),
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

  private parseStoredMessage(row: ConversationMessage): InstagramMessageDto {
    const addDbMeta = (m: InstagramMessageDto): InstagramMessageDto => {
      const { read_at, edited_at, ...fromGraph } = m;
      void read_at;
      void edited_at;
      return {
        ...fromGraph,
        ...(row.editedAt != null
          ? { edited_at: row.editedAt.toISOString() }
          : {}),
        ...(row.readAt != null ? { read_at: row.readAt.toISOString() } : {}),
        ...(row.repliedToExternalId != null
          ? { reply_to_id: row.repliedToExternalId }
          : {}),
        system_updated_at: row.systemUpdatedAt.toISOString(),
      };
    };

    try {
      const parsed = JSON.parse(row.instagramJson) as Record<string, unknown>;
      const createdTime = parsed.created_time;
      if (typeof createdTime === "string" && createdTime.length > 0) {
        return addDbMeta({
          ...(parsed as unknown as InstagramMessageDto),
          id:
            typeof parsed.id === "string" && parsed.id.length > 0
              ? parsed.id
              : row.externalId,
        } as InstagramMessageDto);
      }
    } catch {
      /* fallback */
    }

    return addDbMeta({
      id: row.externalId,
      created_time: row.createdAt.toISOString(),
      message: row.message,
      to: {
        data:
          row.receiverId && row.receiverId !== "0"
            ? [{ id: row.receiverId }]
            : [],
      },
    });
  }
}
