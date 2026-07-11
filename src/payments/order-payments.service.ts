import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Order,
  PaymentRequest,
  PaymentRequestStatus,
  PaymentTransaction,
} from "../database/entities";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { WorkspacePermissionsService } from "../workspace-access/workspace-permissions.service";
import { hasBooleanPermission } from "../workspace-access/permissions/permissions-resolver";
import { MonobankApiClient } from "./providers/monobank/monobank-api.client";
import { PaymentDomainService } from "./payment-domain.service";
import { PaymentIntegrationsService } from "./payment-integrations.service";
import { ManualPaymentMethodsService } from "./manual-payment-methods.service";
import {
  calculateRemainingAmount,
} from "./logic/order-payment-status.logic";
import { resolveManualPaymentKind } from "./logic/manual-payment-kind";
import type { CreateOrderPaymentLinkDto } from "./dto/create-order-payment-link.dto";
import type { CreateManualPaymentDto } from "./dto/create-manual-payment.dto";
import type { ManualPaymentResponseDto } from "./dto/manual-payment-response.dto";
import type { SetOrderManualPaymentMethodDto } from "./dto/set-order-manual-payment-method.dto";
import type { OrderPaymentRequestResponseDto } from "./dto/order-payment-request-response.dto";
import type { OrderPaymentTransactionsListResponseDto } from "./dto/order-payment-transactions-list-response.dto";
import type { OrderPaymentRequestsListResponseDto } from "./dto/order-payment-requests-list-response.dto";

@Injectable()
export class OrderPaymentsService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(PaymentRequest)
    private readonly paymentRepo: Repository<PaymentRequest>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly permissions: WorkspacePermissionsService,
    private readonly integrations: PaymentIntegrationsService,
    private readonly manualPaymentMethods: ManualPaymentMethodsService,
    private readonly domain: PaymentDomainService,
    private readonly monobankApi: MonobankApiClient,
  ) {}

  async listPaymentRequestsForOrder(
    userId: number,
    orderId: number,
    appRole?: string,
  ): Promise<OrderPaymentRequestsListResponseDto> {
    await this.requireViewPayments(userId, appRole);
    const order = await this.requireOrder(userId, orderId, appRole);
    const payments = await this.paymentRepo.find({
      where: { workspaceId: order.workspaceId, orderId: order.id },
      order: { createdAt: "DESC" },
    });
    const paidAmount = await this.domain.getPaidAmountForOrder(
      order.workspaceId,
      order.id,
    );
    let selectedManualPaymentMethod = null;
    const selectedManualPaymentKind = resolveManualPaymentKind(
      order.manualPaymentMethodId,
    );
    if (order.manualPaymentMethodId) {
      const method = await this.manualPaymentMethods.requireOwnedMethodForWorkspace(
        order.workspaceId,
        order.manualPaymentMethodId,
      );
      selectedManualPaymentMethod = this.manualPaymentMethods.toDto(method);
    }
    return {
      orderId: order.id,
      totalAmount: order.totalAmount,
      paidAmount,
      remainingAmount: calculateRemainingAmount(order.totalAmount, paidAmount),
      paymentStatus: order.paymentStatus,
      payments: payments.map((p) => this.toPaymentDto(p)),
      selectedManualPaymentMethod,
      selectedManualPaymentKind,
    };
  }

  async setOrderManualPaymentMethod(
    userId: number,
    orderId: number,
    dto: SetOrderManualPaymentMethodDto,
    appRole?: string,
  ) {
    await this.requireViewPayments(userId, appRole);
    const order = await this.requireOrder(userId, orderId, appRole);

    if (dto.manualPaymentMethodId == null) {
      order.manualPaymentMethodId = null;
    } else {
      await this.manualPaymentMethods.requireOwnedMethodForWorkspace(
        order.workspaceId,
        dto.manualPaymentMethodId,
      );
      order.manualPaymentMethodId = dto.manualPaymentMethodId;
    }

    await this.orderRepo.save(order);
    return this.listPaymentRequestsForOrder(userId, orderId, appRole);
  }

  async listTransactionsForOrder(
    userId: number,
    orderId: number,
    appRole?: string,
  ): Promise<OrderPaymentTransactionsListResponseDto> {
    await this.requireViewPayments(userId, appRole);
    const order = await this.requireOrder(userId, orderId, appRole);
    const transactions = await this.transactionRepo.find({
      where: { workspaceId: order.workspaceId, orderId: order.id },
      order: { occurredAt: "DESC" },
    });
    return {
      orderId: order.id,
      transactions: transactions.map((t) => ({
        id: t.id,
        paymentId: t.paymentId,
        provider: t.provider,
        type: t.type,
        amount: t.amount,
        currency: t.currency,
        status: t.status,
        source: t.source,
        externalTransactionId: t.externalTransactionId,
        note: t.note,
        manualPaymentMethodId: t.manualPaymentMethodId,
        manualPaymentKind: resolveManualPaymentKind(t.manualPaymentMethodId),
        occurredAt: t.occurredAt.toISOString(),
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  async createPaymentLink(
    userId: number,
    orderId: number,
    dto: CreateOrderPaymentLinkDto,
    appRole?: string,
  ): Promise<OrderPaymentRequestResponseDto> {
    await this.requireCreatePaymentLink(userId, appRole);
    const order = await this.requireOrder(userId, orderId, appRole);
    const integration = await this.integrations.requireConnectedIntegration(
      order.workspaceId,
      dto.integrationId,
    );

    const paidAmount = await this.domain.getPaidAmountForOrder(
      order.workspaceId,
      order.id,
    );
    const remaining = calculateRemainingAmount(order.totalAmount, paidAmount);
    const amount = dto.amount ?? remaining;

    if (amount <= 0) {
      throw new BadRequestException("Amount must be greater than zero");
    }
    if (amount > remaining) {
      throw new BadRequestException(
        `Amount exceeds remaining balance (${remaining})`,
      );
    }
    if (order.currency.toUpperCase() !== "UAH") {
      throw new BadRequestException(
        "Online payment is available for UAH orders only",
      );
    }

    const payment = this.paymentRepo.create({
      workspaceId: order.workspaceId,
      orderId: order.id,
      integrationId: integration.id,
      provider: integration.provider,
      amount,
      currency: order.currency,
      status: PaymentRequestStatus.pending,
      createdById: userId,
    });
    const savedDraft = await this.paymentRepo.save(payment);

    const reference = this.domain.buildPaymentReference(
      order.workspaceId,
      order.id,
      savedDraft.id,
    );

    const provider = this.domain.resolveProviderForIntegration(integration);
    let linkResult;
    try {
      linkResult = await provider.createPaymentLink({
        amount,
        currency: order.currency,
        reference,
        description: `Order #${order.id}`,
        redirectUrl: this.monobankApi.resolveOrderPaymentRedirectUrl(),
        webhookUrl: this.monobankApi.resolveOrderPaymentWebhookUrl(),
      });
    } catch (error) {
      await this.paymentRepo.remove(savedDraft);
      throw error;
    }

    savedDraft.externalPaymentId = linkResult.externalPaymentId;
    savedDraft.paymentUrl = linkResult.paymentUrl;
    savedDraft.expiresAt = linkResult.expiresAt;
    savedDraft.status = PaymentRequestStatus.pending;
    const saved = await this.paymentRepo.save(savedDraft);
    return this.toPaymentDto(saved);
  }

  async syncPaymentStatus(
    userId: number,
    orderId: number,
    paymentId: number,
    appRole?: string,
  ): Promise<OrderPaymentRequestResponseDto> {
    await this.requireViewPayments(userId, appRole);
    const order = await this.requireOrder(userId, orderId, appRole);
    const payment = await this.requireOrderPayment(order, paymentId);
    if (!payment.externalPaymentId) {
      throw new BadRequestException("Payment has no external payment id");
    }

    const provider = this.domain.resolveProviderForIntegration(
      payment.integration ?? (await this.integrations.getIntegrationById(
        payment.workspaceId,
        payment.integrationId,
      )),
    );
    const status = await provider.getPaymentStatus(payment.externalPaymentId);
    const updated = await this.domain.applyProviderEvent(
      payment.id,
      {
        externalPaymentId: status.externalPaymentId,
        providerStatus: status.providerStatus,
        localStatus: status.localStatus,
        amount: status.amount,
        currency: status.currency,
        paidAt: status.paidAt,
        failureReason: status.failureReason,
        externalTransactionId: status.externalPaymentId
          ? `${status.externalPaymentId}:success`
          : null,
        providerModifiedAt: status.providerModifiedAt,
      },
      "manual_sync",
      userId,
    );
    return this.toPaymentDto(updated);
  }

  async recordManualPayment(
    userId: number,
    orderId: number,
    dto: CreateManualPaymentDto,
    appRole?: string,
  ): Promise<ManualPaymentResponseDto> {
    await this.requireManualPayment(userId, appRole);
    const order = await this.requireOrder(userId, orderId, appRole);

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : undefined;
    if (occurredAt && Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException("occurredAt is invalid");
    }

    let manualPaymentMethodId: number | null = null;
    if (dto.manualPaymentMethodId != null) {
      await this.manualPaymentMethods.requireOwnedMethodForWorkspace(
        order.workspaceId,
        dto.manualPaymentMethodId,
      );
      manualPaymentMethodId = dto.manualPaymentMethodId;
    }

    const result = await this.domain.recordManualPayment({
      workspaceId: order.workspaceId,
      orderId: order.id,
      amount: dto.amount,
      currency: order.currency,
      confirmedById: userId,
      note: dto.note,
      reference: dto.reference,
      occurredAt,
      manualPaymentMethodId,
    });

    return {
      orderId: order.id,
      paymentStatus: result.paymentStatus,
      totalAmount: result.totalAmount,
      paidAmount: result.paidAmount,
      remainingAmount: result.remainingAmount,
      transaction: {
        id: result.transaction.id,
        paymentId: result.transaction.paymentId,
        provider: result.transaction.provider,
        type: result.transaction.type,
        amount: result.transaction.amount,
        currency: result.transaction.currency,
        status: result.transaction.status,
        source: result.transaction.source,
        externalTransactionId: result.transaction.externalTransactionId,
        note: result.transaction.note,
        manualPaymentMethodId: result.transaction.manualPaymentMethodId,
        manualPaymentKind: resolveManualPaymentKind(
          result.transaction.manualPaymentMethodId,
        ),
        occurredAt: result.transaction.occurredAt.toISOString(),
        createdAt: result.transaction.createdAt.toISOString(),
      },
    };
  }

  async cancelPaymentLink(
    userId: number,
    orderId: number,
    paymentId: number,
    appRole?: string,
  ): Promise<OrderPaymentRequestResponseDto> {
    await this.requireCancelPaymentLink(userId, appRole);
    const order = await this.requireOrder(userId, orderId, appRole);
    const payment = await this.requireOrderPayment(order, paymentId);
    this.domain.assertPaymentCancellable(payment);

    if (payment.externalPaymentId) {
      const integration = await this.integrations.getIntegrationById(
        order.workspaceId,
        payment.integrationId,
      );
      const provider = this.domain.resolveProviderForIntegration(integration);
      await provider.cancelPayment(payment.externalPaymentId);
    }

    payment.status = PaymentRequestStatus.cancelled;
    const saved = await this.paymentRepo.save(payment);
    return this.toPaymentDto(saved);
  }

  async handleMonobankWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): Promise<void> {
    const payload = JSON.parse(rawBody.toString("utf8")) as {
      invoiceId?: string;
    };
    const externalPaymentId = payload.invoiceId?.trim();
    if (!externalPaymentId) {
      throw new BadRequestException("Missing invoiceId in webhook");
    }

    const payment = await this.domain.findPaymentByExternalId(externalPaymentId);
    if (!payment) {
      return;
    }

    const integration =
      payment.integration ??
      (await this.integrations.getIntegrationById(
        payment.workspaceId,
        payment.integrationId,
      ));
    const provider = this.domain.resolveProviderForIntegration(integration);
    const valid = await provider.verifyWebhook(rawBody, headers);
    if (!valid) {
      throw new BadRequestException("Invalid webhook signature");
    }

    const event = provider.parseWebhook(rawBody);
    await this.domain.applyProviderEvent(payment.id, event, "provider_webhook");
  }

  private async requireOrder(
    userId: number,
    orderId: number,
    appRole?: string,
  ): Promise<Order> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(userId, appRole);
    const order = await this.orderRepo.findOne({
      where: { workspaceId: workspace.id, id: orderId },
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    return order;
  }

  private async requireOrderPayment(
    order: Order,
    paymentId: number,
  ): Promise<PaymentRequest> {
    const payment = await this.paymentRepo.findOne({
      where: {
        id: paymentId,
        workspaceId: order.workspaceId,
        orderId: order.id,
      },
      relations: { integration: true },
    });
    if (!payment) {
      throw new NotFoundException("Payment not found");
    }
    return payment;
  }

  private async requireViewPayments(
    userId: number,
    appRole?: string,
  ): Promise<void> {
    const resolved = await this.permissions.getResolvedForUser(userId, appRole);
    if (!hasBooleanPermission(resolved, "payments.view")) {
      throw new ForbiddenException("Missing payments.view permission");
    }
  }

  private async requireCreatePaymentLink(
    userId: number,
    appRole?: string,
  ): Promise<void> {
    const resolved = await this.permissions.getResolvedForUser(userId, appRole);
    if (!hasBooleanPermission(resolved, "payments.links.create")) {
      throw new ForbiddenException("Missing payments.links.create permission");
    }
  }

  private async requireManualPayment(
    userId: number,
    appRole?: string,
  ): Promise<void> {
    const resolved = await this.permissions.getResolvedForUser(userId, appRole);
    if (!hasBooleanPermission(resolved, "payments.manual.create")) {
      throw new ForbiddenException("Missing payments.manual.create permission");
    }
  }

  private async requireCancelPaymentLink(
    userId: number,
    appRole?: string,
  ): Promise<void> {
    const resolved = await this.permissions.getResolvedForUser(userId, appRole);
    if (!hasBooleanPermission(resolved, "payments.links.cancel")) {
      throw new ForbiddenException("Missing payments.links.cancel permission");
    }
  }

  private toPaymentDto(payment: PaymentRequest): OrderPaymentRequestResponseDto {
    return {
      id: payment.id,
      orderId: payment.orderId,
      integrationId: payment.integrationId,
      method: payment.method,
      provider: payment.provider,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      externalPaymentId: payment.externalPaymentId,
      paymentUrl: payment.paymentUrl,
      expiresAt: payment.expiresAt?.toISOString() ?? null,
      paidAt: payment.paidAt?.toISOString() ?? null,
      failureReason: payment.failureReason,
      createdById: payment.createdById,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    };
  }
}
