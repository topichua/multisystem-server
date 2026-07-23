import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import {
  Order,
  OrderDeliveryInfo,
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
import { OrderDeliveryProvider } from "../database/entities/order-delivery-provider.enum";
import {
  calculateOrderPaymentStatus,
  calculatePaidAmount,
  calculateRemainingAmount,
} from "./logic/order-payment-status.logic";
import { PaymentProviderFactory } from "./providers/payment-provider.factory";
import type { ParsedWebhookEvent } from "./providers/payment-provider.types";
import { canMonobankCancelPaymentLink } from "./providers/monobank/monobank.status-mapper";
import { OrderPaymentStatusApplicationService } from "./order-payment-status-application.service";
import {
  appendOrderPaymentEvent,
  OrderPaymentEventType,
} from "./order-payment-events";

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
    private readonly paymentStatusApplication: OrderPaymentStatusApplicationService,
  ) {}

  async applyProviderEvent(
    paymentId: number,
    event: ParsedWebhookEvent,
    source: "provider_webhook" | "manual_sync",
    confirmedById?: number,
  ): Promise<PaymentRequest> {
    const txResult = await this.dataSource.transaction(async (manager) => {
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
        return { payment, paymentStatusResult: null, timelineEvent: null };
      }

      const previousStatus = payment.status;
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
          source: PaymentTransactionSource.online_payment,
          confirmedById: confirmedById ?? null,
          chargeAmount: payment.amount,
        });
      } else if (
        event.localStatus === PaymentRequestStatus.failed ||
        event.localStatus === PaymentRequestStatus.cancelled ||
        event.localStatus === PaymentRequestStatus.expired
      ) {
        await this.markPendingOnlineChargeFailed(manager, payment, event);
      }

      const paymentStatusResult =
        await this.paymentStatusApplication.updateOrderPaymentStatus(
          manager,
          payment.workspaceId,
          payment.orderId,
        );

      const wasOpen =
        previousStatus === PaymentRequestStatus.pending ||
        previousStatus === PaymentRequestStatus.processing;

      let timelineEvent: {
        type: (typeof OrderPaymentEventType)[keyof typeof OrderPaymentEventType];
        payload: Record<string, unknown>;
      } | null = null;

      if (
        event.localStatus === PaymentRequestStatus.succeeded &&
        previousStatus !== PaymentRequestStatus.succeeded
      ) {
        timelineEvent = {
          type: OrderPaymentEventType.PAYMENT_SUCCEEDED,
          payload: {
            method: "online_payment",
            paymentId: payment.id,
            provider: payment.provider,
            amount: payment.amount,
            currency: payment.currency,
            externalPaymentId: payment.externalPaymentId,
            source,
            paymentStatus: paymentStatusResult.paymentStatus,
          },
        };
      } else if (
        wasOpen &&
        (event.localStatus === PaymentRequestStatus.cancelled ||
          event.localStatus === PaymentRequestStatus.expired)
      ) {
        timelineEvent = {
          type: OrderPaymentEventType.PAYMENT_CANCELLED,
          payload: {
            action: event.localStatus,
            method: "online_payment",
            paymentId: payment.id,
            provider: payment.provider,
            amount: payment.amount,
            currency: payment.currency,
            externalPaymentId: payment.externalPaymentId,
            source,
            failureReason: event.failureReason,
          },
        };
      }

      if (timelineEvent) {
        await appendOrderPaymentEvent(manager, {
          workspaceId: payment.workspaceId,
          orderId: payment.orderId,
          type: timelineEvent.type,
          actorId: confirmedById ?? null,
          payload: timelineEvent.payload,
        });
      }

      return { payment, paymentStatusResult, timelineEvent };
    });

    if (txResult.paymentStatusResult) {
      await this.paymentStatusApplication.notifyPaymentStatusChangeIfNeeded(
        txResult.payment.workspaceId,
        txResult.payment.orderId,
        txResult.paymentStatusResult,
      );
    }
    return txResult.payment;
  }

  async recalculateOrderPaymentStatusForOrder(
    workspaceId: number,
    orderId: number,
  ): Promise<OrderPaymentStatus> {
    const result = await this.dataSource.transaction(async (manager) =>
      this.paymentStatusApplication.updateOrderPaymentStatus(
        manager,
        workspaceId,
        orderId,
      ),
    );
    await this.paymentStatusApplication.notifyPaymentStatusChangeIfNeeded(
      workspaceId,
      orderId,
      result,
    );
    return result.paymentStatus;
  }

  async recordManualPayment(input: {
    workspaceId: number;
    orderId: number;
    amount: number;
    currency: string;
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
        status: PaymentTransactionStatus.pending,
        source: PaymentTransactionSource.manual,
        externalTransactionId: reference,
        note,
        confirmedById: null,
        occurredAt,
        manualPaymentMethodId: input.manualPaymentMethodId ?? null,
      });
      const saved = await manager.getRepository(PaymentTransaction).save(tx);

      const existingTransactions = await manager
        .getRepository(PaymentTransaction)
        .find({
          where: { workspaceId: input.workspaceId, orderId: input.orderId },
        });
      const paidAmount = calculatePaidAmount(existingTransactions);
      const remaining = calculateRemainingAmount(order.totalAmount, paidAmount);

      return {
        transaction: saved,
        paymentStatus: order.paymentStatus,
        totalAmount: order.totalAmount,
        paidAmount,
        remainingAmount: remaining,
      };
    });
  }

  async confirmManualPayment(input: {
    workspaceId: number;
    orderId: number;
    transactionId: number;
    confirmedById: number;
    occurredAt?: Date;
    note?: string | null;
  }): Promise<{
    transaction: PaymentTransaction;
    paymentStatus: OrderPaymentStatus;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
  }> {
    return this.dataSource
      .transaction(async (manager) => {
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

        const tx = await manager.getRepository(PaymentTransaction).findOne({
          where: {
            id: input.transactionId,
            workspaceId: input.workspaceId,
            orderId: input.orderId,
          },
        });
        if (!tx) {
          throw new NotFoundException("Payment transaction not found");
        }
        if (tx.source !== PaymentTransactionSource.manual) {
          throw new BadRequestException(
            tx.source === PaymentTransactionSource.online_payment
              ? "Online payments cannot be confirmed manually by a manager"
              : tx.source === PaymentTransactionSource.nova_poshta_payment
                ? "Nova Poshta COD payments cannot be confirmed via manual approve"
                : "Only manual payment transactions can be confirmed this way",
          );
        }
        if (tx.type !== PaymentTransactionType.charge) {
          throw new BadRequestException(
            "Only charge transactions can be confirmed as paid",
          );
        }
        if (tx.status === PaymentTransactionStatus.succeeded) {
          throw new ConflictException("Manual payment is already paid");
        }
        if (tx.status !== PaymentTransactionStatus.pending) {
          throw new BadRequestException(
            `Manual payment cannot be confirmed from status "${tx.status}"`,
          );
        }

        const existingTransactions = await manager
          .getRepository(PaymentTransaction)
          .find({
            where: { workspaceId: input.workspaceId, orderId: input.orderId },
          });
        const others = existingTransactions.filter((row) => row.id !== tx.id);
        const paidAmount = calculatePaidAmount(others);
        const remaining = calculateRemainingAmount(
          order.totalAmount,
          paidAmount,
        );
        if (tx.amount > remaining) {
          throw new BadRequestException(
            `Amount exceeds remaining balance (${remaining})`,
          );
        }

        if (input.occurredAt) {
          tx.occurredAt = input.occurredAt;
        }
        if (input.note !== undefined) {
          tx.note = input.note?.trim() || null;
        }
        tx.status = PaymentTransactionStatus.succeeded;
        tx.confirmedById = input.confirmedById;
        const saved = await manager.getRepository(PaymentTransaction).save(tx);

        const paymentStatusResult =
          await this.paymentStatusApplication.updateOrderPaymentStatus(
            manager,
            input.workspaceId,
            input.orderId,
          );

        const updatedPaidAmount = calculatePaidAmount([...others, saved]);

        return {
          transaction: saved,
          paymentStatus: paymentStatusResult.paymentStatus,
          paymentStatusResult,
          totalAmount: order.totalAmount,
          paidAmount: updatedPaidAmount,
          remainingAmount: calculateRemainingAmount(
            order.totalAmount,
            updatedPaidAmount,
          ),
        };
      })
      .then(async (result) => {
        await this.paymentStatusApplication.notifyPaymentStatusChangeIfNeeded(
          input.workspaceId,
          input.orderId,
          result.paymentStatusResult,
        );
        return {
          transaction: result.transaction,
          paymentStatus: result.paymentStatus,
          totalAmount: result.totalAmount,
          paidAmount: result.paidAmount,
          remainingAmount: result.remainingAmount,
        };
      });
  }

  /**
   * Creates a pending Nova Poshta COD charge and links it on `order_delivery_infos.payment_id`.
   * Cannot be approved via `confirmManualPayment` — use `confirmNovaPoshtaDeliveryPayment`.
   */
  async createNovaPoshtaDeliveryPayment(input: {
    workspaceId: number;
    orderId: number;
    deliveryInfoId: number;
    amount?: number;
    note?: string | null;
    occurredAt?: Date;
  }): Promise<{
    transaction: PaymentTransaction;
    paymentStatus: OrderPaymentStatus;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
  }> {
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

      const delivery = await manager.getRepository(OrderDeliveryInfo).findOne({
        where: { id: input.deliveryInfoId },
      });
      if (!delivery) {
        throw new NotFoundException("Delivery info not found");
      }
      if (order.deliveryId !== delivery.id) {
        throw new BadRequestException(
          "Delivery info is not linked to this order",
        );
      }
      if (delivery.provider !== OrderDeliveryProvider.nova_poshta) {
        throw new BadRequestException(
          "Nova Poshta COD payment requires nova_poshta delivery",
        );
      }
      if (!delivery.isCashOnDelivery) {
        throw new BadRequestException(
          "Delivery is not marked as cash on delivery",
        );
      }

      if (delivery.paymentId != null) {
        const existing = await manager
          .getRepository(PaymentTransaction)
          .findOne({
            where: {
              id: delivery.paymentId,
              workspaceId: input.workspaceId,
              orderId: input.orderId,
            },
          });
        if (existing) {
          throw new ConflictException(
            "Delivery already has a linked Nova Poshta payment",
          );
        }
      }

      const amount =
        input.amount != null
          ? input.amount
          : (delivery.cashOnDeliveryAmount ?? 0);
      if (!(amount > 0)) {
        throw new BadRequestException(
          "COD amount must be greater than zero (set cashOnDeliveryAmount or pass amount)",
        );
      }

      const existingTransactions = await manager
        .getRepository(PaymentTransaction)
        .find({
          where: { workspaceId: input.workspaceId, orderId: input.orderId },
        });
      const paidAmount = calculatePaidAmount(existingTransactions);
      const remaining = calculateRemainingAmount(order.totalAmount, paidAmount);
      if (amount > remaining) {
        throw new BadRequestException(
          `Amount exceeds remaining balance (${remaining})`,
        );
      }

      const occurredAt = input.occurredAt ?? new Date();
      const note = input.note?.trim() || null;

      const tx = manager.getRepository(PaymentTransaction).create({
        workspaceId: input.workspaceId,
        orderId: input.orderId,
        paymentId: null,
        provider: null,
        type: PaymentTransactionType.charge,
        amount,
        currency: order.currency,
        status: PaymentTransactionStatus.pending,
        source: PaymentTransactionSource.nova_poshta_payment,
        externalTransactionId: null,
        note,
        confirmedById: null,
        occurredAt,
        manualPaymentMethodId: null,
      });
      const saved = await manager.getRepository(PaymentTransaction).save(tx);

      delivery.paymentId = saved.id;
      await manager.getRepository(OrderDeliveryInfo).save(delivery);

      return {
        transaction: saved,
        paymentStatus: order.paymentStatus,
        totalAmount: order.totalAmount,
        paidAmount,
        remainingAmount: remaining,
      };
    });
  }

  /**
   * Marks a pending Nova Poshta COD payment as succeeded (money received from carrier).
   * Not available through the manual payment confirm endpoint.
   */
  async confirmNovaPoshtaDeliveryPayment(input: {
    workspaceId: number;
    orderId: number;
    transactionId: number;
    confirmedById?: number | null;
    occurredAt?: Date;
    note?: string | null;
  }): Promise<{
    transaction: PaymentTransaction;
    paymentStatus: OrderPaymentStatus;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
  }> {
    return this.dataSource
      .transaction(async (manager) => {
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

        const tx = await manager.getRepository(PaymentTransaction).findOne({
          where: {
            id: input.transactionId,
            workspaceId: input.workspaceId,
            orderId: input.orderId,
          },
        });
        if (!tx) {
          throw new NotFoundException("Payment transaction not found");
        }
        if (tx.source !== PaymentTransactionSource.nova_poshta_payment) {
          throw new BadRequestException(
            "Only Nova Poshta COD payment transactions can be confirmed this way",
          );
        }
        if (tx.type !== PaymentTransactionType.charge) {
          throw new BadRequestException(
            "Only charge transactions can be confirmed as paid",
          );
        }
        if (tx.status === PaymentTransactionStatus.succeeded) {
          throw new ConflictException("Nova Poshta payment is already paid");
        }
        if (tx.status !== PaymentTransactionStatus.pending) {
          throw new BadRequestException(
            `Nova Poshta payment cannot be confirmed from status "${tx.status}"`,
          );
        }

        const existingTransactions = await manager
          .getRepository(PaymentTransaction)
          .find({
            where: { workspaceId: input.workspaceId, orderId: input.orderId },
          });
        const others = existingTransactions.filter((row) => row.id !== tx.id);
        const paidAmount = calculatePaidAmount(others);
        const remaining = calculateRemainingAmount(
          order.totalAmount,
          paidAmount,
        );
        if (tx.amount > remaining) {
          throw new BadRequestException(
            `Amount exceeds remaining balance (${remaining})`,
          );
        }

        if (input.occurredAt) {
          tx.occurredAt = input.occurredAt;
        }
        if (input.note !== undefined) {
          tx.note = input.note?.trim() || null;
        }
        tx.status = PaymentTransactionStatus.succeeded;
        tx.confirmedById = input.confirmedById ?? null;
        const saved = await manager.getRepository(PaymentTransaction).save(tx);

        const paymentStatusResult =
          await this.paymentStatusApplication.updateOrderPaymentStatus(
            manager,
            input.workspaceId,
            input.orderId,
          );

        const updatedPaidAmount = calculatePaidAmount([...others, saved]);

        return {
          transaction: saved,
          paymentStatus: paymentStatusResult.paymentStatus,
          paymentStatusResult,
          totalAmount: order.totalAmount,
          paidAmount: updatedPaidAmount,
          remainingAmount: calculateRemainingAmount(
            order.totalAmount,
            updatedPaidAmount,
          ),
        };
      })
      .then(async (result) => {
        await this.paymentStatusApplication.notifyPaymentStatusChangeIfNeeded(
          input.workspaceId,
          input.orderId,
          result.paymentStatusResult,
        );
        return {
          transaction: result.transaction,
          paymentStatus: result.paymentStatus,
          totalAmount: result.totalAmount,
          paidAmount: result.paidAmount,
          remainingAmount: result.remainingAmount,
        };
      });
  }

  async deletePendingPayment(input: {
    workspaceId: number;
    orderId: number;
    paymentId: number;
  }): Promise<{ deletedId: number; paymentRequestId: number | null }> {
    return this.dataSource.transaction(async (manager) => {
      const tx = await manager.getRepository(PaymentTransaction).findOne({
        where: {
          id: input.paymentId,
          workspaceId: input.workspaceId,
          orderId: input.orderId,
        },
      });

      if (tx) {
        if (tx.status !== PaymentTransactionStatus.pending) {
          throw new ConflictException(
            `Only pending payments can be deleted (current status: "${tx.status}")`,
          );
        }

        if (
          tx.source === PaymentTransactionSource.online_payment &&
          tx.paymentId != null
        ) {
          const payment = await manager.getRepository(PaymentRequest).findOne({
            where: {
              id: tx.paymentId,
              workspaceId: input.workspaceId,
              orderId: input.orderId,
            },
          });
          if (payment) {
            await this.deleteOnlinePaymentRequest(manager, payment);
            return {
              deletedId: tx.id,
              paymentRequestId: payment.id,
            };
          }
        }

        await manager.getRepository(PaymentTransaction).delete(tx.id);
        return { deletedId: tx.id, paymentRequestId: null };
      }

      // Clients often pass the payment-request id (same as sync/cancel), not the
      // transaction id from order.payment.payments[].
      const payment = await manager.getRepository(PaymentRequest).findOne({
        where: {
          id: input.paymentId,
          workspaceId: input.workspaceId,
          orderId: input.orderId,
        },
      });
      if (!payment) {
        throw new NotFoundException("Payment not found");
      }

      const pendingTx = await manager.getRepository(PaymentTransaction).findOne({
        where: {
          paymentId: payment.id,
          workspaceId: input.workspaceId,
          orderId: input.orderId,
          status: PaymentTransactionStatus.pending,
          type: PaymentTransactionType.charge,
        },
      });
      await this.deleteOnlinePaymentRequest(manager, payment);
      return {
        deletedId: pendingTx?.id ?? payment.id,
        paymentRequestId: payment.id,
      };
    });
  }

  private async deleteOnlinePaymentRequest(
    manager: EntityManager,
    payment: PaymentRequest,
  ): Promise<void> {
    // Lock payment first so concurrent sync/delete share a consistent lock order
    // (payment → transactions) and avoid deadlocks.
    const locked = await manager
      .getRepository(PaymentRequest)
      .createQueryBuilder("p")
      .setLock("pessimistic_write")
      .where("p.id = :id", { id: payment.id })
      .andWhere("p.workspace_id = :workspaceId", {
        workspaceId: payment.workspaceId,
      })
      .andWhere("p.order_id = :orderId", { orderId: payment.orderId })
      .getOne();
    if (!locked) {
      throw new NotFoundException("Payment not found");
    }
    if (locked.status === PaymentRequestStatus.succeeded) {
      throw new ConflictException(
        "Cannot delete a succeeded online payment request",
      );
    }
    const linked = await manager.getRepository(PaymentTransaction).find({
      where: {
        paymentId: locked.id,
        workspaceId: locked.workspaceId,
        orderId: locked.orderId,
      },
    });
    if (
      linked.some((row) => row.status === PaymentTransactionStatus.succeeded)
    ) {
      throw new ConflictException(
        "Cannot delete a payment linked to a succeeded online charge",
      );
    }
    // Remove ledger rows first (FK RESTRICT on payment_id).
    if (linked.length > 0) {
      await manager.getRepository(PaymentTransaction).delete({
        paymentId: locked.id,
        workspaceId: locked.workspaceId,
        orderId: locked.orderId,
      });
    }
    await manager.getRepository(PaymentRequest).delete(locked.id);
  }

  /** Creates a pending online charge row linked to a payment request (listed in transactions). */
  async createPendingOnlineChargeTransaction(input: {
    workspaceId: number;
    orderId: number;
    paymentId: number;
    provider: PaymentRequest["provider"];
    amount: number;
    currency: string;
  }): Promise<PaymentTransaction> {
    const tx = this.transactionRepo.create({
      workspaceId: input.workspaceId,
      orderId: input.orderId,
      paymentId: input.paymentId,
      provider: input.provider,
      type: PaymentTransactionType.charge,
      amount: input.amount,
      currency: input.currency,
      status: PaymentTransactionStatus.pending,
      source: PaymentTransactionSource.online_payment,
      externalTransactionId: null,
      note: null,
      confirmedById: null,
      occurredAt: new Date(),
      manualPaymentMethodId: null,
    });
    return this.transactionRepo.save(tx);
  }

  async cancelPendingOnlineChargeForPayment(input: {
    workspaceId: number;
    orderId: number;
    paymentId: number;
  }): Promise<void> {
    const pending = await this.transactionRepo.findOne({
      where: {
        workspaceId: input.workspaceId,
        orderId: input.orderId,
        paymentId: input.paymentId,
        status: PaymentTransactionStatus.pending,
        type: PaymentTransactionType.charge,
        source: PaymentTransactionSource.online_payment,
      },
    });
    if (!pending) {
      return;
    }
    pending.status = PaymentTransactionStatus.failed;
    await this.transactionRepo.save(pending);
  }

  private async markPendingOnlineChargeFailed(
    manager: EntityManager,
    payment: PaymentRequest,
    event: ParsedWebhookEvent,
  ): Promise<void> {
    const pending = await manager.getRepository(PaymentTransaction).findOne({
      where: {
        paymentId: payment.id,
        status: PaymentTransactionStatus.pending,
        type: PaymentTransactionType.charge,
      },
    });
    if (!pending) {
      return;
    }
    pending.status = PaymentTransactionStatus.failed;
    if (event.failureReason) {
      pending.note = event.failureReason;
    }
    await manager.getRepository(PaymentTransaction).save(pending);
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

    const existingByExternal = await manager
      .getRepository(PaymentTransaction)
      .findOne({
        where: {
          provider: payment.provider,
          externalTransactionId,
        },
      });
    if (existingByExternal) {
      this.logger.log(
        `Charge transaction already exists externalTransactionId=${externalTransactionId}`,
      );
      return;
    }

    const pending = await manager.getRepository(PaymentTransaction).findOne({
      where: {
        paymentId: payment.id,
        status: PaymentTransactionStatus.pending,
        type: PaymentTransactionType.charge,
      },
    });
    if (pending) {
      pending.status = PaymentTransactionStatus.succeeded;
      pending.source = options.source;
      pending.amount = options.chargeAmount;
      pending.currency = event.currency;
      pending.externalTransactionId = externalTransactionId;
      pending.confirmedById = options.confirmedById;
      pending.occurredAt = event.paidAt ?? new Date();
      await manager.getRepository(PaymentTransaction).save(pending);
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
