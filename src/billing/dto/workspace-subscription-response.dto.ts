import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { BillingCycle } from "../../database/entities/billing-cycle.enum";
import { SubscriptionStatus } from "../../database/entities/subscription-status.enum";
import type { WorkspaceEntitlementsSnapshot } from "../types/workspace-entitlements.interface";
import { InvoiceListItemResponseDto } from "./invoice-detail-response.dto";
import { PlanTemplateResponseDto } from "./plan-template-response.dto";

export class WorkspaceSubscriptionResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  workspaceId: number;

  @ApiProperty({ nullable: true })
  planTemplateId: number | null;

  @ApiPropertyOptional({ type: PlanTemplateResponseDto, nullable: true })
  plan: PlanTemplateResponseDto | null;

  @ApiProperty({ enum: SubscriptionStatus })
  status: SubscriptionStatus;

  @ApiProperty()
  entitlementsSnapshot: WorkspaceEntitlementsSnapshot;

  @ApiProperty({ enum: BillingCycle })
  billingCycle: BillingCycle;

  @ApiProperty()
  periodStart: string;

  @ApiProperty()
  periodEnd: string;

  @ApiProperty({ nullable: true })
  customLabel: string | null;

  @ApiProperty({ nullable: true })
  canceledAt: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiProperty({
    description: "Manual billing only — no card-on-file / auto-renew.",
  })
  manualRenewal: true;

  @ApiProperty({
    description: "Paid period has ended; user must renew manually.",
  })
  isExpired: boolean;

  @ApiProperty({
    description: "User can request a renewal invoice (paid plans only).",
  })
  canRenew: boolean;

  @ApiPropertyOptional({ type: InvoiceListItemResponseDto, nullable: true })
  pendingInvoice: InvoiceListItemResponseDto | null;
}
