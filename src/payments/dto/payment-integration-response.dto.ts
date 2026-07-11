import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  PaymentIntegrationStatus,
  PaymentProvider,
} from "../../database/entities";

export class PaymentIntegrationResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  workspaceId!: number;

  @ApiProperty({ enum: PaymentProvider })
  provider!: PaymentProvider;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({ enum: PaymentIntegrationStatus })
  status!: PaymentIntegrationStatus;

  @ApiProperty()
  isDefault!: boolean;

  @ApiPropertyOptional({ nullable: true })
  credentialsMasked!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastConnectionCheckAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastError!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class AvailablePaymentProviderDto {
  @ApiProperty({ enum: PaymentProvider })
  provider!: PaymentProvider;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  connected!: boolean;
}

export class PaymentIntegrationsListResponseDto {
  @ApiProperty({ type: [AvailablePaymentProviderDto] })
  availableProviders!: AvailablePaymentProviderDto[];

  @ApiProperty({ type: [PaymentIntegrationResponseDto] })
  integrations!: PaymentIntegrationResponseDto[];
}
