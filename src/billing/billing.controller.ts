import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { SuperAdminGuard } from "../auth/super-admin.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { EntitlementsService } from "./entitlements.service";
import { InvoicesService } from "./invoices.service";
import { PlansService } from "./plans.service";
import { SubscriptionChangeService } from "./subscription-change.service";
import { SubscriptionsService } from "./subscriptions.service";
import { ChangeSubscriptionRequestDto } from "./dto/change-subscription-request.dto";
import { ChangeSubscriptionResponseDto } from "./dto/change-subscription-response.dto";
import {
  InvoiceDetailResponseDto,
  InvoicesListResponseDto,
} from "./dto/invoice-detail-response.dto";
import { ListInvoicesQueryDto } from "./dto/list-invoices-query.dto";
import { PlanTemplateResponseDto } from "./dto/plan-template-response.dto";
import { UpdateWorkspaceEntitlementsRequestDto } from "./dto/update-workspace-entitlements-request.dto";
import { WorkspaceEntitlementsResponseDto } from "./dto/workspace-entitlements-response.dto";
import { WorkspaceSubscriptionResponseDto } from "./dto/workspace-subscription-response.dto";
import { MonopayPaymentService } from "./monopay/monopay-payment.service";
import { SubscriptionRenewalService } from "./subscription-renewal.service";
import { BillingDevGuard } from "./billing-dev.guard";
import { RenewSubscriptionResponseDto } from "./dto/renew-subscription-response.dto";
import { InitInvoicePaymentResponseDto } from "./dto/init-invoice-payment-response.dto";
import { SyncInvoicePaymentResponseDto } from "./dto/sync-invoice-payment-response.dto";
import { MonopayConfigService } from "./monopay/monopay-config.service";
import { MonopayTestService } from "./monopay/monopay-test.service";
import { MonopayConfigCheckResponseDto } from "./dto/monopay-config-check-response.dto";
import { MonopayTestInvoiceResponseDto } from "./dto/monopay-test-invoice-response.dto";
import { MonopayTestInvoiceStatusResponseDto } from "./dto/monopay-test-invoice-status-response.dto";
import { CreditPricingService } from "./credit-pricing.service";
import { CreditPurchaseService } from "./credit-purchase.service";
import { CreditPricingResponseDto } from "./dto/credit-pricing-response.dto";
import { UpdateCreditPricingRequestDto } from "./dto/update-credit-pricing-request.dto";
import { PurchaseCreditsRequestDto } from "./dto/purchase-credits-request.dto";
import { PurchaseCreditsResponseDto } from "./dto/purchase-credits-response.dto";

@ApiTags("billing")
@Controller("billing")
export class BillingPlansController {
  constructor(
    private readonly plans: PlansService,
    private readonly monopayConfig: MonopayConfigService,
    private readonly monopayTest: MonopayTestService,
    private readonly creditPricing: CreditPricingService,
  ) {}

  @Get("plans")
  @ApiOperation({ summary: "List public billing plan templates" })
  @ApiOkResponse({ type: [PlanTemplateResponseDto] })
  listPlans(): Promise<PlanTemplateResponseDto[]> {
    return this.plans.listPublicPlans();
  }

  @Get("credit-pricing")
  @ApiOperation({ summary: "Current AI credit purchase pricing" })
  @ApiOkResponse({ type: CreditPricingResponseDto })
  getCreditPricing(): Promise<CreditPricingResponseDto> {
    return this.creditPricing.getPublicPricing();
  }

  @Get("monopay/config-check")
  @UseGuards(JwtAuthGuard, BillingDevGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "[Dev] Verify MonoPay environment configuration",
    description:
      "Checks MONOPAY_TOKEN, URL env vars, and calls MonoPay pubkey API to validate the token. " +
      "Available when NODE_ENV is not production or ENABLE_DEV_BILLING_SIMULATOR=true.",
  })
  @ApiOkResponse({ type: MonopayConfigCheckResponseDto })
  checkMonopayConfig(): Promise<MonopayConfigCheckResponseDto> {
    return this.monopayConfig.checkConfiguration();
  }

  @Post("monopay/test-invoice")
  @UseGuards(JwtAuthGuard, BillingDevGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "[Dev] Create real MonoPay test invoice for 1 UAH",
    description:
      "Calls Acquiring API POST /api/merchant/invoice/create with X-Token. " +
      "Requires Merchant token from web.monobank.ua (NOT Personal API token).",
  })
  @ApiOkResponse({ type: MonopayTestInvoiceResponseDto })
  createMonopayTestInvoice(): Promise<MonopayTestInvoiceResponseDto> {
    return this.monopayTest.createOneUahTestInvoice();
  }

  @Get("monopay/test-invoice/:monoInvoiceId/status")
  @UseGuards(JwtAuthGuard, BillingDevGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "[Dev] Poll MonoPay invoice status by monoInvoiceId",
    description:
      "Calls GET /api/merchant/invoice/status — use when webhook did not arrive.",
  })
  @ApiParam({ name: "monoInvoiceId", example: "p2_9ZgpZVsl3" })
  @ApiOkResponse({ type: MonopayTestInvoiceStatusResponseDto })
  getMonopayTestInvoiceStatus(
    @Param("monoInvoiceId") monoInvoiceId: string,
  ): Promise<MonopayTestInvoiceStatusResponseDto> {
    return this.monopayTest.getTestInvoiceStatus(monoInvoiceId.trim());
  }
}

@ApiTags("workspace — billing")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("workspace/billing")
export class WorkspaceBillingController {
  constructor(
    private readonly workspaceAccess: WorkspaceAccessContextService,
    private readonly entitlements: EntitlementsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly subscriptionChange: SubscriptionChangeService,
    private readonly subscriptionRenewal: SubscriptionRenewalService,
    private readonly monopayPayment: MonopayPaymentService,
    private readonly invoices: InvoicesService,
    private readonly creditPurchase: CreditPurchaseService,
  ) {}

  @Get("entitlements")
  @ApiOperation({ summary: "Current workspace entitlements and usage" })
  @ApiOkResponse({ type: WorkspaceEntitlementsResponseDto })
  async getEntitlements(
    @Req() req: { user?: AuthUser },
  ): Promise<WorkspaceEntitlementsResponseDto> {
    const workspaceId = await this.resolveWorkspaceId(req);
    return this.entitlements.getForWorkspace(workspaceId);
  }

  @Get("subscription")
  @ApiOperation({ summary: "Active workspace subscription" })
  @ApiOkResponse({ type: WorkspaceSubscriptionResponseDto })
  async getSubscription(
    @Req() req: { user?: AuthUser },
  ): Promise<WorkspaceSubscriptionResponseDto> {
    const workspaceId = await this.resolveWorkspaceId(req);
    return this.subscriptions.getActiveForWorkspace(workspaceId);
  }

  @Post("subscription/change")
  @ApiOperation({ summary: "Change workspace plan (upgrade/downgrade)" })
  @ApiBody({ type: ChangeSubscriptionRequestDto })
  @ApiOkResponse({ type: ChangeSubscriptionResponseDto })
  async changeSubscription(
    @Req() req: { user?: AuthUser },
    @Body() dto: ChangeSubscriptionRequestDto,
  ): Promise<ChangeSubscriptionResponseDto> {
    const userId = this.requireUserId(req);
    const workspaceId = await this.resolveWorkspaceId(req);
    return this.subscriptionChange.changeForWorkspace(workspaceId, userId, dto);
  }

  @Post("subscription/renew")
  @ApiOperation({
    summary: "Create renewal invoice (manual payment, no auto-renew)",
    description:
      "Creates an open invoice for the next billing period. Entitlements extend only after payment.",
  })
  @ApiOkResponse({ type: RenewSubscriptionResponseDto })
  async renewSubscription(
    @Req() req: { user?: AuthUser },
  ): Promise<RenewSubscriptionResponseDto> {
    const userId = this.requireUserId(req);
    const workspaceId = await this.resolveWorkspaceId(req);
    return this.subscriptionRenewal.createRenewalInvoice(workspaceId, userId);
  }

  @Post("credits/purchase")
  @ApiOperation({
    summary: "Create invoice to buy additional AI credits",
    description:
      "Creates an open invoice for the requested credit amount using the global credit price. " +
      "Pay it via POST /workspace/billing/invoices/:id/pay to add credits to the workspace.",
  })
  @ApiBody({ type: PurchaseCreditsRequestDto })
  @ApiOkResponse({ type: PurchaseCreditsResponseDto })
  async purchaseCredits(
    @Req() req: { user?: AuthUser },
    @Body() dto: PurchaseCreditsRequestDto,
  ): Promise<PurchaseCreditsResponseDto> {
    const workspaceId = await this.resolveWorkspaceId(req);
    return this.creditPurchase.createPurchaseInvoice(
      workspaceId,
      dto.creditsAmount,
    );
  }

  @Post("invoices/:id/pay")
  @ApiOperation({
    summary: "Start MonoPay checkout for an open invoice",
    description:
      "Creates a MonoPay invoice and returns paymentUrl. Subscription entitlements activate after webhook confirms payment.",
  })
  @ApiParam({ name: "id", type: Number })
  @ApiOkResponse({ type: InitInvoicePaymentResponseDto })
  async payInvoice(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) invoiceId: number,
  ): Promise<InitInvoicePaymentResponseDto> {
    const workspaceId = await this.resolveWorkspaceId(req);
    return this.monopayPayment.initPaymentForInvoice(workspaceId, invoiceId);
  }

  @Post("invoices/:id/sync-payment")
  @ApiOperation({
    summary: "Sync invoice payment status from MonoPay",
    description:
      "Polls MonoPay invoice/status API. Use after sandbox checkout when webhook cannot reach localhost.",
  })
  @ApiParam({ name: "id", type: Number })
  @ApiOkResponse({ type: SyncInvoicePaymentResponseDto })
  async syncInvoicePayment(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) invoiceId: number,
  ): Promise<SyncInvoicePaymentResponseDto> {
    const workspaceId = await this.resolveWorkspaceId(req);
    return this.monopayPayment.syncPaymentFromProvider(workspaceId, invoiceId);
  }

  @Get("invoices")
  @ApiOperation({ summary: "List workspace invoices" })
  @ApiOkResponse({ type: InvoicesListResponseDto })
  async listInvoices(
    @Req() req: { user?: AuthUser },
    @Query() query: ListInvoicesQueryDto,
  ): Promise<InvoicesListResponseDto> {
    const workspaceId = await this.resolveWorkspaceId(req);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    return this.invoices.listForWorkspace(workspaceId, page, pageSize);
  }

  @Get("invoices/:id")
  @ApiOperation({ summary: "Invoice details" })
  @ApiParam({ name: "id", type: Number })
  @ApiOkResponse({ type: InvoiceDetailResponseDto })
  async getInvoice(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) invoiceId: number,
  ): Promise<InvoiceDetailResponseDto> {
    const workspaceId = await this.resolveWorkspaceId(req);
    return this.invoices.getForWorkspace(workspaceId, invoiceId);
  }

  @Post("invoices/:id/make-paid")
  @HttpCode(HttpStatus.OK)
  @UseGuards(BillingDevGuard)
  @ApiOperation({
    summary: "[Dev] Mark invoice as paid (payment emulator)",
    description:
      "Simulates a successful payment webhook. Available when NODE_ENV is not production, " +
      "or when ENABLE_DEV_BILLING_SIMULATOR=true.",
  })
  @ApiParam({ name: "id", type: Number })
  @ApiOkResponse({ type: InvoiceDetailResponseDto })
  async makeInvoicePaid(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) invoiceId: number,
  ): Promise<InvoiceDetailResponseDto> {
    const workspaceId = await this.resolveWorkspaceId(req);
    return this.invoices.markAsPaidEmulated(workspaceId, invoiceId);
  }

  private async resolveWorkspaceId(req: { user?: AuthUser }): Promise<number> {
    const userId = this.requireUserId(req);
    return this.workspaceAccess.resolveWorkspaceIdForOwner(userId);
  }

  private requireUserId(req: { user?: AuthUser }): number {
    const userId = Number(req.user?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return userId;
  }
}

@ApiTags("admin — billing")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller("admin/workspaces/:workspaceId/billing")
export class BillingAdminController {
  constructor(private readonly subscriptionChange: SubscriptionChangeService) {}

  @Patch("entitlements")
  @ApiOperation({ summary: "Override workspace entitlements (custom plan)" })
  @ApiParam({ name: "workspaceId", type: Number })
  @ApiBody({ type: UpdateWorkspaceEntitlementsRequestDto })
  @ApiOkResponse({ type: ChangeSubscriptionResponseDto })
  async overrideEntitlements(
    @Req() req: { user?: AuthUser },
    @Param("workspaceId", ParseIntPipe) workspaceId: number,
    @Body() dto: UpdateWorkspaceEntitlementsRequestDto,
  ): Promise<ChangeSubscriptionResponseDto> {
    const userId = Number(req.user?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException("Invalid user id");
    }
    return this.subscriptionChange.overrideEntitlementsForWorkspace(
      workspaceId,
      userId,
      dto.entitlements,
      dto.customLabel,
    );
  }
}

@ApiTags("admin — billing")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller("admin/billing")
export class BillingGlobalAdminController {
  constructor(private readonly creditPricing: CreditPricingService) {}

  @Patch("credit-pricing")
  @ApiOperation({ summary: "Update global AI credit purchase pricing" })
  @ApiBody({ type: UpdateCreditPricingRequestDto })
  @ApiOkResponse({ type: CreditPricingResponseDto })
  updateCreditPricing(
    @Body() dto: UpdateCreditPricingRequestDto,
  ): Promise<CreditPricingResponseDto> {
    return this.creditPricing.updatePricing(dto);
  }
}
