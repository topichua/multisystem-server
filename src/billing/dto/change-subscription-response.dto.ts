import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { InvoiceDetailResponseDto } from "./invoice-detail-response.dto";
import { WorkspaceEntitlementsResponseDto } from "./workspace-entitlements-response.dto";
import { WorkspaceSubscriptionResponseDto } from "./workspace-subscription-response.dto";

export class ChangeSubscriptionResponseDto {
  @ApiProperty({ type: WorkspaceSubscriptionResponseDto })
  subscription: WorkspaceSubscriptionResponseDto;

  @ApiProperty({ type: WorkspaceEntitlementsResponseDto })
  entitlements: WorkspaceEntitlementsResponseDto;

  @ApiPropertyOptional({ type: InvoiceDetailResponseDto, nullable: true })
  invoice: InvoiceDetailResponseDto | null;

  @ApiProperty({
    description:
      "True when a paid invoice was created; entitlements activate only after payment (manual, no auto-renew).",
  })
  pendingPayment: boolean;
}
