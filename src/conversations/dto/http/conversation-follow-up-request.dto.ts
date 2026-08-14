import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateConversationFollowUpDto {
  @ApiProperty({
    example: "2026-08-14T00:52:00.000Z",
    description: "When to send the follow-up (ISO 8601).",
  })
  @IsDateString()
  scheduledAt!: string;

  @ApiProperty({
    example: "Доброго дня! Нагадуємо про ваше замовлення…",
    description: "Message text to send (from template, AI, or manual).",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  message!: string;

  @ApiPropertyOptional({
    example: 3,
    description: "Optional template id used to draft the message (audit only).",
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  templateId?: number | null;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description:
      "Cancel this follow-up when the customer replies. Default true.",
  })
  @IsOptional()
  @IsBoolean()
  cancelOnReply?: boolean;
}

export class UpdateConversationFollowUpDto {
  @ApiPropertyOptional({
    example: "2026-08-14T00:52:00.000Z",
  })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  message?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @IsPositive()
  templateId?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  cancelOnReply?: boolean;
}
