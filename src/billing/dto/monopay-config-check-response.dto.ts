import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  MonopayConfigCheckApiTestDto,
  MonopayConfigCheckResolvedDto,
} from "./monopay-config-check-resolved.dto";
import { MonopayIntegrationInfoDto } from "./monopay-integration-info.dto";

export class MonopayConfigCheckItemDto {
  @ApiProperty({ example: "MONOPAY_TOKEN" })
  name: string;

  @ApiProperty({ enum: ["ok", "missing", "invalid", "warning"] })
  status: "ok" | "missing" | "invalid" | "warning";

  @ApiPropertyOptional({ example: "Token is set (64 chars)" })
  message?: string;
}

export class MonopayConfigCheckResponseDto {
  @ApiProperty({
    description: "True when token works and required URLs can be resolved",
  })
  ok: boolean;

  @ApiProperty({ type: [MonopayConfigCheckItemDto] })
  checks: MonopayConfigCheckItemDto[];

  @ApiProperty({ type: MonopayConfigCheckResolvedDto })
  resolved: MonopayConfigCheckResolvedDto;

  @ApiPropertyOptional({
    type: MonopayConfigCheckApiTestDto,
    description:
      "Result of live GET /api/merchant/pubkey with merchant X-Token",
  })
  apiTest?: MonopayConfigCheckApiTestDto;

  @ApiPropertyOptional({
    description: "Which env var supplies the merchant token",
    example: "MONOPAY_MERCHANT_TOKEN",
  })
  tokenEnvKey?: string | null;

  @ApiPropertyOptional({ example: "uPBD…lqjK" })
  tokenPreview?: string | null;

  @ApiPropertyOptional({
    type: MonopayIntegrationInfoDto,
    description: "Acquiring API integration details (not OAuth Checkout)",
  })
  integration?: MonopayIntegrationInfoDto;
}
