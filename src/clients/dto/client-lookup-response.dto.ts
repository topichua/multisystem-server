import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ClientResponseDto } from "./client-response.dto";

/**
 * Always returned with **HTTP 200**: either a linked client or a neutral “no link” payload
 * (no 404) so UIs can treat “not associated” as a normal state, not an error.
 */
export class ClientLookupResponseDto {
  @ApiProperty({
    example: true,
    description:
      "When true, `client` is populated. When false, no matching client exists in your workspace — still a successful response (`status: ok`).",
  })
  associated: boolean;

  @ApiPropertyOptional({
    enum: ["ok"],
    example: "ok",
    description: "Set when `associated` is false.",
  })
  status?: "ok";

  @ApiPropertyOptional({
    type: ClientResponseDto,
    nullable: true,
    description:
      "Populated when `associated` is true. Includes `avatar_src`; `orderStats` when `include_order_stat=true`.",
  })
  client?: ClientResponseDto | null;
}
