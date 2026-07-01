import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** POST / PUT /clients response — no read-only fields (`avatar_src`, `orderStats`). */
export class ClientWriteResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  phone: string;

  @ApiPropertyOptional({
    nullable: true,
    description: "Instagram scoped user id when linked; null if none.",
  })
  instagramUserId: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Telegram user id when linked; null if none.",
  })
  telegramUserId: string | null;

  @ApiProperty()
  workspaceId: number;
}
