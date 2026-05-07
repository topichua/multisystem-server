import { ApiProperty } from "@nestjs/swagger";
import { ClientResponseDto } from "./client-response.dto";

export class ClientsListResponseDto {
  @ApiProperty({ type: [ClientResponseDto] })
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
