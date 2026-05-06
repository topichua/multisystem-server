import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ClientResponseDto } from "./client-response.dto";

/**
 * Always returned with **HTTP 200**: either a linked client or a neutral “no link” payload
 * (no 404) so UIs can treat “not associated” as a normal state, not an error.
 */
export class ClientLookupResponseDto {
  @ApiProperty({
    description:
      "When true, `client` is populated. When false, no row exists for this Instagram id in your workspace — still a successful response (`status: ok`).",
  })
  associated: boolean;

  @ApiPropertyOptional({
    enum: ["ok"],
    description: "Set when `associated` is false.",
  })
  status?: "ok";

  @ApiPropertyOptional({ type: ClientResponseDto, nullable: true })
  client?: ClientResponseDto | null;
}
