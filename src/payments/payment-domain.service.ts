import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  DataSource,
  EntityManager,
  Repository,
} from "typeorm";
import {
  Order,
  OrderPaymentStatus,
  PaymentIntegration,
  PaymentIntegrationStatus,
  PaymentRequest,
  PaymentRequestStatus,
  PaymentTransaction,
  PaymentTransactionSource,
  PaymentTransactionStatus,
  PaymentTransactionType,
} from "../database/entities";
import {
  calculateOrderPaymentStatus,
  calculatePaidAmount,
  calculateRemainingAmount,
} from "./logic/order-payment-status.logic";
import { PaymentProviderFactory } from "./providers/payment-provider.factory";
import type { ParsedWebhookEvent } from "./providers/payment-provider.types";
import { canMonobankCancelPaymentLink } from "./providers/monobank/monobank.status-mapper";

@Injectable()
export class PaymentDomainService {
  private readonly logger = new Logger(PaymentDomainService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PaymentRequest)
    private readonly paymentRepo: Repository<PaymentRequest>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly providerFactory: PaymentProviderFactory,
  ) {}

  async applyProviderEvent(
    paymentId: number,
    event: ParsedWebhookEvent,
    source: "provider_webhook" | "manual_sync",
    confirmedById?: number,
  ): Promise<PaymentRequest> {
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager
        .getRepository(PaymentRequest)
        .createQueryBuilder("p")
        .setLock("pessimistic_write")
        .where("p.id = :id", { id: paymentId })
        .getOne();

      if (!payment) {
        throw new NotFoundException("Payment not found");
      }

      if (
        event.providerModifiedAt &&
        payment.paidAt &&
        payment.status === PaymentRequestStatus.succeeded &&
        event.localStatus === PaymentRequestStatus.succeeded
      ) {
        this.logger.log(
          `Payment ${payment.id} already succeeded — skipping duplicate provider event`,
        );
        return payment;
      }

      payment.status = event.localStatus;
      if (event.failureReason) {
        payment.failureReason = event.failureReason;
      }
      if (event.localStatus === PaymentRequestStatus.succeeded) {
        payment.paidAt = event.paidAt ?? new Date();
      }

      await manager.getRepository(PaymentRequest).save(payment);

      if (event.localStatus === PaymentRequestStatus.succeeded) {
      await this.createChargeTransactionIfNeeded(manager, payment, event, {
        source:
          source === "provider_webhook"
            ? PaymentTransactionSource.provider_webhook
            : PaymentTransactionSource.system,
        confirmedById: confirmedById ?? null,
        chargeAmount: payment.amount,
      });
      }

      await this.recalculateOrderPaymentStatus(
        manager,
        payment.workspaceId,
        payment.orderId,
      );

      return payment;
    });
  }

  async recalculateOrderPaymentStatusForOrder(
    workspaceId: number,
    orderId: number,
  ): Promise<OrderPaymentStatus> {
    return this.dataSource.transaction(async (manager) =>
      this.recalculateOrderPaymentStatus(manager, workspaceId, orderId),
    );
  }

  async recordManualPayment(input: {
    workspaceId: number;
    orderId: number;
    amount: number;
    currency: string;
    confirmedById: number;
    note?: string | null;
    reference?: string | null;
    occurredAt?: Date;
    manualPaymentMethodId?: number | null;
  }): Promise<{
    transaction: PaymentTransaction;
    paymentStatus: OrderPaymentStatus;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
  }> {
    if (input.amount <= 0) {
      throw new BadRequestException("Amount must be greater than zero");
    }

    return this.dataSource.transaction(async (manager) => {
      const order = await manager
        .getRepository(Order)
        .createQueryBuilder("o")
        .setLock("pessimistic_write")
        .where("o.workspace_id = :workspaceId AND o.id = :orderId", {
          workspaceId: input.workspaceId,
          orderId: input.orderId,
        })
        .getOne();

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      const existingTransactions = await manager
        .getRepository(PaymentTransaction)
        .find({
          where: { workspaceId: input.workspaceId, orderId: input.orderId },
        });
      const paidAmount = calculatePaidAmount(existingTransactions);
      const remaining = calculateRemainingAmount(order.totalAmount, paidAmount);

      if (input.amount > remaining) {
        throw new BadRequestException(
          `Amount exceeds remaining balance (${remaining})`,
        );
      }

      const occurredAt = input.occurredAt ?? new Date();
      const reference = input.reference?.trim() || null;
      const note = input.note?.trim() || null;

      const tx = manager.getRepository(PaymentTransaction).create({
        workspaceId: input.workspaceId,
        orderId: input.orderId,
        paymentId: null,
        provider: null,
        type: PaymentTransactionType.charge,
        amount: input.amount,
        currency: input.currency,
        status: PaymentTransactionStatus.succeeded,
        source: PaymentTransactionSource.manual,
        externalTransactionId: reference,
        note,
        confirmedById: input.confirmedById,
        occurredAt,
        manualPaymentMethodId: input.manualPaymentMethodId ?? null,
      });
      const saved = await manager.getRepository(PaymentTransaction).save(tx);

      const paymentStatus = await this.recalculateOrderPaymentStatus(
        manager,
        input.workspaceId,
        input.orderId,
      );

      const updatedPaidAmount = calculatePaidAmount([
        ...existingTransactions,
        saved,
      ]);

      return {
        transaction: saved,
        paymentStatus,
        totalAmount: order.totalAmount,
        paidAmount: updatedPaidAmount,
        remainingAmount: calculateRemainingAmount(
          order.totalAmount,
          updatedPaidAmount,
        ),
      };
    });
  }

  private async createChargeTransactionIfNeeded(
    manager: EntityManager,
    payment: PaymentRequest,
    event: ParsedWebhookEvent,
    options: {
      source: PaymentTransactionSource;
      confirmedById: number | null;
      chargeAmount: number;
    },
  ): Promise<void> {
    const externalTransactionId =
      event.externalTransactionId ?? `${payment.externalPaymentId}:success`;

    const existing = await manager.getRepository(PaymentTransaction).findOne({
      where: {
        provider: payment.provider,
        externalTransactionId,
      },
    });
    if (existing) {
      this.logger.log(
        `Charge transaction already exists externalTransactionId=${externalTransactionId}`,
      );
      return;
    }

    try {
      const tx = manager.getRepository(PaymentTransaction).create({
        workspaceId: payment.workspaceId,
        orderId: payment.orderId,
        paymentId: payment.id,
        provider: payment.provider,
        type: PaymentTransactionType.charge,
        amount: options.chargeAmount,
        currency: event.currency,
        status: PaymentTransactionStatus.succeeded,
        source: options.source,
        externalTransactionId,
        confirmedById: options.confirmedById,
        occurredAt: event.paidAt ?? new Date(),
      });
      await manager.getRepository(PaymentTransaction).save(tx);
    } catch (error) {
      const pgCode = (error as { code?: string })?.code;
      if (pgCode === "23505") {
        this.logger.log(
          `Duplicate charge transaction ignored externalTransactionId=${externalTransactionId}`,
        );
        return;
      }
      throw error;
    }
  }

  private async recalculateOrderPaymentStatus(
    manager: EntityManager,
    workspaceId: number,
    orderId: number,
  ): Promise<OrderPaymentStatus> {
    const order = await manager.getRepository(Order).findOne({
      where: { workspaceId, id: orderId },
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }

    const transactions = await manager.getRepository(PaymentTransaction).find({
      where: { workspaceId, orderId },
    });

    const paidAmount = calculatePaidAmount(transactions);
    const paymentStatus = calculateOrderPaymentStatus(
      order.totalAmount,
      paidAmount,
    );

    order.paymentStatus = paymentStatus;
    if (paymentStatus === OrderPaymentStatus.paid || paymentStatus === OrderPaymentStatus.overpaid) {
      if (!order.paidAt) {
        const latestCharge = transactions
          .filter(
            (t) =>
              t.type === PaymentTransactionType.charge &&
              t.status === PaymentTransactionStatus.succeeded,
          )
          .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
        order.paidAt = latestCharge?.occurredAt ?? new Date();
      }
    } else if (paymentStatus === OrderPaymentStatus.unpaid) {
      order.paidAt = null;
    }

    await manager.getRepository(Order).save(order);
    return paymentStatus;
  }

  async getPaidAmountForOrder(
    workspaceId: number,
    orderId: number,
  ): Promise<number> {
    const transactions = await this.transactionRepo.find({
      where: { workspaceId, orderId },
    });
    return calculatePaidAmount(transactions);
  }

  assertPaymentCancellable(payment: PaymentRequest): void {
    if (payment.status === PaymentRequestStatus.succeeded) {
      throw new BadRequestException("Cannot cancel a succeeded payment");
    }
    if (!canMonobankCancelPaymentLink(payment.status)) {
      throw new BadRequestException(
        `Payment cannot be cancelled from status "${payment.status}"`,
      );
    }
  }

  buildPaymentReference(
    workspaceId: number,
    orderId: number,
    paymentId: number,
  ): string {
    return `ws${workspaceId}-ord${orderId}-pay${paymentId}`;
  }

  async findPaymentByExternalId(
    externalPaymentId: string,
  ): Promise<PaymentRequest | null> {
    return this.paymentRepo.findOne({
      where: { externalPaymentId },
      relations: { integration: true },
    });
  }

  resolveProviderForIntegration(integration: PaymentIntegration) {
    if (!integration.credentialsEncrypted) {
      throw new BadRequestException("Integration has no credentials");
    }
    const credentials = this.providerFactory.decryptCredentials(
      integration.provider,
      integration.credentialsEncrypted,
    );
    return this.providerFactory.getProvider(credentials);
  }
}
