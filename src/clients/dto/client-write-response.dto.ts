import { ApiProperty } from "@nestjs/swagger";

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

  @ApiProperty({ type: [String] })
  instagramUserIds: string[];

  @ApiProperty({ type: [String] })
  telegramUserIds: string[];

  @ApiProperty()
  workspaceId: number;
}
