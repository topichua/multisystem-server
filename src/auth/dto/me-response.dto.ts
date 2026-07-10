import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UserStatus } from "../../database/entities";
import { BillingCycle } from "../../database/entities/billing-cycle.enum";
import { SubscriptionStatus } from "../../database/entities/subscription-status.enum";
import { InvoiceListItemResponseDto } from "../../billing/dto/invoice-detail-response.dto";
import { PlanTemplateResponseDto } from "../../billing/dto/plan-template-response.dto";
import { WorkspaceEntitlementsResponseDto } from "../../billing/dto/workspace-entitlements-response.dto";
import { ResolvedUserPermissionsResponseDto } from "../../workspace-access/dto/http/resolved-user-permissions-response.dto";

export class CompanyMeDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  pageId: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Instagram Business Account id (Graph `instagram_business_account.id`) for this company when connected.",
  })
  instagramAccountId: string | null;

  @ApiProperty({
    description: "Owning workspace id (`integration.workspace_id`).",
  })
  workspaceId: number;
}

export class UserMeDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiPropertyOptional({ nullable: true })
  lastName: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Avatar image URL.",
  })
  avatar_src: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "+380501234567",
    description: "Mobile phone in E.164 or local format.",
  })
  phone: string | null;

  @ApiProperty({ enum: UserStatus, enumName: "UserStatus" })
  status: UserStatus;

  @ApiPropertyOptional({ nullable: true })
  invitedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  invitedByUserId: number | null;

  @ApiPropertyOptional({ nullable: true })
  invitationExpiresAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  invitationAcceptedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  emailVerifiedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  lastSeenAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  lastLoginAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  country: string | null;

  @ApiPropertyOptional({ nullable: true })
  region: string | null;

  @ApiPropertyOptional({ nullable: true })
  city: string | null;

  @ApiPropertyOptional({ nullable: true })
  streetLine1: string | null;

  @ApiPropertyOptional({ nullable: true })
  streetLine2: string | null;

  @ApiPropertyOptional({ nullable: true })
  postalCode: string | null;

  @ApiProperty({ type: "object", additionalProperties: true })
  metadata: Record<string, unknown>;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class WorkspaceSubscriptionMeDto {
  @ApiProperty({
    description: "When the current billing period ends (ISO). Renew before this date.",
    example: "2026-08-01T00:00:00.000Z",
  })
  periodEnd: string;

  @ApiProperty({
    description: "Start of the current billing period (ISO).",
    example: "2026-07-01T00:00:00.000Z",
  })
  periodStart: string;

  @ApiProperty({ enum: SubscriptionStatus })
  status: SubscriptionStatus;

  @ApiProperty({ enum: BillingCycle })
  billingCycle: BillingCycle;

  @ApiProperty({
    description: "True when periodEnd has passed and the plan is no longer active.",
  })
  isExpired: boolean;

  @ApiProperty({
    description: "True when the workspace can request a renewal invoice.",
  })
  canRenew: boolean;

  @ApiPropertyOptional({
    type: InvoiceListItemResponseDto,
    nullable: true,
    description: "Open renewal invoice waiting for payment, if any.",
  })
  pendingInvoice: InvoiceListItemResponseDto | null;
}

export class WorkspaceRoleMeDto {
  @ApiPropertyOptional({
    nullable: true,
    description: "Workspace role id. Null for workspace owners.",
  })
  id: number | null;

  @ApiProperty({ example: "manager" })
  slug: string;

  @ApiProperty({ example: "Manager" })
  name: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ nullable: true })
  color: string | null;

  @ApiProperty({
    description: "True when the user owns the workspace (full access).",
  })
  isOwner: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description: "Workspace member id when the user is not the owner.",
  })
  memberId: number | null;
}

export class MeResponseDto {
  @ApiProperty()
  email: string;

  @ApiProperty({ example: "super_admin" })
  role: string;

  @ApiPropertyOptional({ type: UserMeDto, nullable: true })
  user: UserMeDto | null;

  @ApiPropertyOptional({ type: CompanyMeDto, nullable: true })
  company: CompanyMeDto | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Company display name when a company row exists for this user",
  })
  companyName: string | null;

  @ApiPropertyOptional({
    type: PlanTemplateResponseDto,
    nullable: true,
    description:
      "Active billing plan for the JWT workspace session, when available.",
  })
  plan: PlanTemplateResponseDto | null;

  @ApiPropertyOptional({
    type: WorkspaceEntitlementsResponseDto,
    nullable: true,
    description:
      "Effective workspace entitlements and usage for the JWT workspace session.",
  })
  entitlements: WorkspaceEntitlementsResponseDto | null;

  @ApiPropertyOptional({
    type: WorkspaceSubscriptionMeDto,
    nullable: true,
    description:
      "Active subscription period for the JWT workspace session, including when the plan ends.",
  })
  subscription: WorkspaceSubscriptionMeDto | null;

  @ApiPropertyOptional({
    type: ResolvedUserPermissionsResponseDto,
    nullable: true,
    description:
      "Resolved workspace permissions for the JWT workspace session (use for UI feature flags).",
  })
  permissions: ResolvedUserPermissionsResponseDto | null;

  @ApiPropertyOptional({
    type: WorkspaceRoleMeDto,
    nullable: true,
    description:
      "Workspace role for the current user in the JWT workspace session.",
  })
  workspaceRole: WorkspaceRoleMeDto | null;
}
