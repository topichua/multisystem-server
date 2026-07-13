import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

export type OutboundConversationMessageMediaType = "image" | "video" | "audio";

/** POST /conversations/:conversationId/messages (JSON or multipart fields). */
export class SendInstagramMessageRequestDto {
  @ApiPropertyOptional({
    minLength: 1,
    description:
      "Text body or media caption. Required when no `file` is uploaded.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  message?: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Optional. Omit, null, or empty string for a normal message. Set to the parent message `id` (Graph `mid`) from GET .../messages to send a threaded reply (must exist in this conversation).",
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined) return undefined;
    const s = typeof value === "string" ? value : String(value);
    const t = s.trim();
    return t.length > 0 ? t : undefined;
  })
  @IsString()
  @MinLength(1)
  reply_to_id?: string;

  @ApiPropertyOptional({
    enum: ["image", "video", "audio"],
    description: "Required with multipart `file` upload.",
  })
  @IsOptional()
  @IsIn(["image", "video", "audio"])
  type?: OutboundConversationMessageMediaType;
}
