import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class MonopayConfigCheckResolvedDto {
  @ApiProperty({ example: "https://api.monobank.ua" })
  apiBaseUrl: string;

  @ApiPropertyOptional({
    example: "https://api.example.com/webhooks/monopay",
    nullable: true,
  })
  webhookUrl: string | null;

  @ApiPropertyOptional({
    example: "https://app.example.com/billing/payment/result",
    nullable: true,
  })
  redirectUrl: string | null;

  @ApiProperty({ example: 3600 })
  invoiceValiditySec: number;
}

export class MonopayConfigCheckApiTestDto {
  @ApiProperty()
  ok: boolean;

  @ApiPropertyOptional({ example: 200 })
  httpStatus?: number;

  @ApiPropertyOptional({ example: "HTTP 401" })
  error?: string;

  @ApiProperty()
  publicKeyFetched: boolean;
}
