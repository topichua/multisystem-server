import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ClientOrderStatDto } from "./client-order-stat.dto";

/** GET /clients response item — includes read-only computed fields. */
export class ClientResponseDto {
  @ApiProperty({ example: 42 })
  id: number;

  @ApiProperty({ example: "Іван" })
  firstName: string;

  @ApiProperty({ example: "Петренко" })
  lastName: string;

  @ApiProperty({ example: "2026-01-15T10:30:00.000Z" })
  createdAt: Date;

  @ApiProperty({ example: "+380501234567" })
  phone: string;

  @ApiProperty({
    type: [String],
    example: ["17841400008460056"],
    description:
      "Instagram ids from `client_links` (provider `instagram`).",
  })
  instagramUserIds: string[];

  @ApiProperty({
    type: [String],
    example: ["123456789"],
    description: "Telegram ids from `client_links` (provider `telegram`).",
  })
  telegramUserIds: string[];

  @ApiProperty({ example: 1 })
  workspaceId: number;

  @ApiPropertyOptional({
    nullable: true,
    example: "https://cdn.example.com/avatars/user.jpg",
    description:
      "GET only. First available profile picture from linked Telegram or Instagram users.",
  })
  avatar_src?: string | null;

  @ApiPropertyOptional({
    type: ClientOrderStatDto,
    description:
      "Present when `include_order_stat=true`. Order aggregates for this client.",
  })
  orderStats?: ClientOrderStatDto;
}
