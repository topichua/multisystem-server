import { ApiProperty } from "@nestjs/swagger";

export class MonopayIntegrationInfoDto {
  @ApiProperty({ example: "acquiring", enum: ["acquiring"] })
  api: "acquiring";

  @ApiProperty({ example: "X-Token", enum: ["X-Token"] })
  auth: "X-Token";

  @ApiProperty({ example: "https://api.monobank.ua" })
  baseUrl: string;

  @ApiProperty({ example: "/api/merchant/invoice/create" })
  createEndpoint: string;

  @ApiProperty({ example: "/api/merchant/invoice/status" })
  statusEndpoint: string;

  @ApiProperty({ example: "/api/merchant/pubkey" })
  pubkeyEndpoint: string;

  @ApiProperty({ example: "X-Sign (ECDSA SHA-256)" })
  webhookVerification: string;

  @ApiProperty({
    example: false,
    description: "OAuth Checkout API is not implemented in this server",
  })
  oauthCheckoutSupported: boolean;
}
