import { ApiProperty } from "@nestjs/swagger";
import { ClientResponseDto } from "./client-response.dto";

export class ClientsListResponseDto {
  @ApiProperty({
    type: [ClientResponseDto],
    description:
      "Page of clients. Each item includes `avatar_src`; `orderStats` when `include_order_stat=true`.",
  })
  items: ClientResponseDto[];

  @ApiProperty({
    description:
      "Total clients in the workspace matching the list (no other filters).",
  })
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;
}
