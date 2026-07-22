import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import {
  Order,
  OrderRefund,
  OrderRefundStatus,
  PaymentTransaction,
  PaymentTransactionSource,
  PaymentTransactionStatus,
  PaymentTransactionType,
} from "../database/entities";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { WorkspacePermissionsService } from "../workspace-access/workspace-permissions.service";
import { hasBooleanPermission } from "../workspace-access/permissions/permissions-resolver";
import { OrderPaymentStatusApplicationService } from "./order-payment-status-application.service";
import {
  calculatePaidAmount,
  calculateRemainingAmount,
} from "./logic/order-payment-status.logic";
import {
  appendOrderPaymentEvent,
  OrderPaymentEventType,
} from "./order-payment-events";
import type { CreateOrderRefundDto } from "./dto/create-order-refund.dto";
import type { ReviewOrderRefundDto } from "./dto/review-order-refund.dto";
import type {
  ApproveOrderRefundResponseDto,
  OrderRefundResponseDto,
  OrderRefundsListResponseDto,
} from "./dto/order-refund-response.dto";

@Injectable()
export class OrderRefundsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderRefund)
    private readonly refundRepo: Repository<OrderRefund>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly permissions: WorkspacePermissionsService,
    private readonly paymentStatusApplication: OrderPaymentStatusApplicationService,
  ) {}

  async listRefunds(
    userId: number,
    orderId: number,
    appRole?: string,
  ): Promise<OrderRefundsListResponseDto> {
    await this.requireManagePayments(userId, appRole);
    const order = await this.requireOrder(userId, orderId, appRole);
    const refunds = await this.refundRepo.find({
      where: { workspaceId: order.workspaceId, orderId: order.id },
      order: { createdAt: "DESC" },
    });
    return {
      orderId: order.id,
      refunds: refunds.map((r) => this.toDto(r)),
    };
  }

  async createRefund(
    userId: number,
    orderId: number,
    dto: CreateOrderRefundDto,
    appRole?: string,
  ): Promise<OrderRefundResponseDto> {
    await this.requireManagePayments(userId, appRole);
    const order = await this.requireOrder(userId, orderId, appRole);

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException("occurredAt is invalid");
    }

    const paidAmount = await this.getPaidAmount(order.workspaceId, order.id);
    if (paidAmount <= 0) {
      throw new BadRequestException("Order has no paid amount to refund");
    }
    const pendingReserved = await this.getPendingRefundAmount(
      order.workspaceId,
      order.id,
    );
    const available =
      Math.round((paidAmount - pendingReserved + Number.EPSILON) * 100) / 100;
    if (dto.amount > available) {
      throw new BadRequestException(
        `Refund amount exceeds available paid amount (${available}) after pending refunds`,
      );
    }

    const refund = await this.refundRepo.save(
      this.refundRepo.create({
        workspaceId: order.workspaceId,
        orderId: order.id,
        amount: dto.amount,
        currency: order.currency,
        status: OrderRefundStatus.pending,
        note: dto.note?.trim() || null,
        createdById: userId,
        reviewedById: null,
        reviewedAt: null,
        paymentTransactionId: null,
        occurredAt,
      }),
    );

    await appendOrderPaymentEvent(this.refundRepo.manager, {
      workspaceId: order.workspaceId,
      orderId: order.id,
      type: OrderPaymentEventType.PAYMENT_REFUND_REQUESTED,
      actorId: userId,
      payload: {
        refundId: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
      },
    });

    return this.toDto(refund);
  }

  async approveRefund(
    userId: number,
    orderId: number,
    refundId: number,
    dto: ReviewOrderRefundDto,
    appRole?: string,
  ): Promise<ApproveOrderRefundResponseDto> {
    await this.requireManagePayments(userId, appRole);
    const order = await this.requireOrder(userId, orderId, appRole);

    const result = await this.dataSource.transaction(async (manager) => {
      const lockedOrder = await manager
        .getRepository(Order)
        .createQueryBuilder("o")
        .setLock("pessimistic_write")
        .where("o.workspace_id = :workspaceId AND o.id = :orderId", {
          workspaceId: order.workspaceId,
          orderId: order.id,
        })
        .getOne();
      if (!lockedOrder) {
        throw new NotFoundException("Order not found");
      }

      const refund = await manager
        .getRepository(OrderRefund)
        .createQueryBuilder("r")
        .setLock("pessimistic_write")
        .where(
          "r.id = :refundId AND r.workspace_id = :workspaceId AND r.order_id = :orderId",
          {
            refundId,
            workspaceId: order.workspaceId,
            orderId: order.id,
          },
        )
        .getOne();
      if (!refund) {
        throw new NotFoundException("Refund not found");
      }
      if (refund.status !== OrderRefundStatus.pending) {
        throw new ConflictException(
          `Only pending refunds can be approved (current status: "${refund.status}")`,
        );
      }

      const transactions = await manager.getRepository(PaymentTransaction).find({
        where: { workspaceId: order.workspaceId, orderId: order.id },
      });
      const paidAmount = calculatePaidAmount(transactions);
      if (refund.amount > paidAmount) {
        throw new BadRequestException(
          `Refund amount exceeds paid amount (${paidAmount})`,
        );
      }

      if (dto.note !== undefined) {
        refund.note = dto.note?.trim() || null;
      }

      const ledger = manager.getRepository(PaymentTransaction).create({
        workspaceId: order.workspaceId,
        orderId: order.id,
        paymentId: null,
        provider: null,
        type: PaymentTransactionType.refund,
        amount: refund.amount,
        currency: refund.currency,
        status: PaymentTransactionStatus.succeeded,
        source: PaymentTransactionSource.manual,
        externalTransactionId: null,
        note: refund.note,
        confirmedById: userId,
        occurredAt: refund.occurredAt,
        manualPaymentMethodId: null,
      });
      const savedLedger = await manager
        .getRepository(PaymentTransaction)
        .save(ledger);

      refund.status = OrderRefundStatus.approved;
      refund.reviewedById = userId;
      refund.reviewedAt = new Date();
      refund.paymentTransactionId = savedLedger.id;
      const savedRefund = await manager.getRepository(OrderRefund).save(refund);

      const paymentStatusResult =
        await this.paymentStatusApplication.updateOrderPaymentStatus(
          manager,
          order.workspaceId,
          order.id,
        );

      const updatedPaidAmount = calculatePaidAmount([
        ...transactions,
        savedLedger,
      ]);

      await appendOrderPaymentEvent(manager, {
        workspaceId: order.workspaceId,
        orderId: order.id,
        type: OrderPaymentEventType.PAYMENT_REFUNDED,
        actorId: userId,
        payload: {
          refundId: savedRefund.id,
          transactionId: savedLedger.id,
          amount: savedRefund.amount,
          currency: savedRefund.currency,
          paymentStatus: paymentStatusResult.paymentStatus,
          paidAmount: updatedPaidAmount,
          remainingAmount: calculateRemainingAmount(
            lockedOrder.totalAmount,
            updatedPaidAmount,
          ),
        },
      });

      return {
        refund: savedRefund,
        paymentStatusResult,
        totalAmount: lockedOrder.totalAmount,
        paidAmount: updatedPaidAmount,
        remainingAmount: calculateRemainingAmount(
          lockedOrder.totalAmount,
          updatedPaidAmount,
        ),
      };
    });

    await this.paymentStatusApplication.notifyPaymentStatusChangeIfNeeded(
      order.workspaceId,
      order.id,
      result.paymentStatusResult,
    );

    return {
      orderId: order.id,
      paymentStatus: result.paymentStatusResult.paymentStatus,
      totalAmount: result.totalAmount,
      paidAmount: result.paidAmount,
      remainingAmount: result.remainingAmount,
      refund: this.toDto(result.refund),
    };
  }

  async rejectRefund(
    userId: number,
    orderId: number,
    refundId: number,
    dto: ReviewOrderRefundDto,
    appRole?: string,
  ): Promise<OrderRefundResponseDto> {
    await this.requireManagePayments(userId, appRole);
    const order = await this.requireOrder(userId, orderId, appRole);
    const refund = await this.requirePendingRefund(
      order.workspaceId,
      order.id,
      refundId,
    );

    if (dto.note !== undefined) {
      refund.note = dto.note?.trim() || null;
    }
    refund.status = OrderRefundStatus.rejected;
    refund.reviewedById = userId;
    refund.reviewedAt = new Date();
    const saved = await this.refundRepo.save(refund);

    await appendOrderPaymentEvent(this.refundRepo.manager, {
      workspaceId: order.workspaceId,
      orderId: order.id,
      type: OrderPaymentEventType.PAYMENT_REFUND_REJECTED,
      actorId: userId,
      payload: {
        refundId: saved.id,
        amount: saved.amount,
        currency: saved.currency,
        status: saved.status,
      },
    });

    return this.toDto(saved);
  }

  async cancelRefund(
    userId: number,
    orderId: number,
    refundId: number,
    appRole?: string,
  ): Promise<void> {
    await this.requireManagePayments(userId, appRole);
    const order = await this.requireOrder(userId, orderId, appRole);
    const refund = await this.requirePendingRefund(
      order.workspaceId,
      order.id,
      refundId,
    );

    refund.status = OrderRefundStatus.cancelled;
    refund.reviewedById = userId;
    refund.reviewedAt = new Date();
    await this.refundRepo.save(refund);

    await appendOrderPaymentEvent(this.refundRepo.manager, {
      workspaceId: order.workspaceId,
      orderId: order.id,
      type: OrderPaymentEventType.PAYMENT_REFUND_CANCELLED,
      actorId: userId,
      payload: {
        refundId: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
      },
    });
  }

  private async getPaidAmount(
    workspaceId: number,
    orderId: number,
  ): Promise<number> {
    const transactions = await this.transactionRepo.find({
      where: { workspaceId, orderId },
    });
    return calculatePaidAmount(transactions);
  }

  private async getPendingRefundAmount(
    workspaceId: number,
    orderId: number,
  ): Promise<number> {
    const pending = await this.refundRepo.find({
      where: {
        workspaceId,
        orderId,
        status: OrderRefundStatus.pending,
      },
    });
    return Math.round(
      (pending.reduce((sum, row) => sum + Number(row.amount), 0) +
        Number.EPSILON) *
        100,
    ) / 100;
  }

  private async requirePendingRefund(
    workspaceId: number,
    orderId: number,
    refundId: number,
  ): Promise<OrderRefund> {
    const refund = await this.refundRepo.findOne({
      where: { id: refundId, workspaceId, orderId },
    });
    if (!refund) {
      throw new NotFoundException("Refund not found");
    }
    if (refund.status !== OrderRefundStatus.pending) {
      throw new ConflictException(
        `Only pending refunds can be changed (current status: "${refund.status}")`,
      );
    }
    return refund;
  }

  private async requireOrder(
    userId: number,
    orderId: number,
    appRole?: string,
  ): Promise<Order> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      userId,
      appRole,
    );
    const order = await this.orderRepo.findOne({
      where: { workspaceId: workspace.id, id: orderId },
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    return order;
  }

  private async requireManagePayments(
    userId: number,
    appRole?: string,
  ): Promise<void> {
    const resolved = await this.permissions.getResolvedForUser(userId, appRole);
    if (
      !hasBooleanPermission(resolved, "orders.payments.manage") &&
      !hasBooleanPermission(resolved, "payments.manual.create")
    ) {
      throw new ForbiddenException(
        "Missing orders.payments.manage permission",
      );
    }
  }

  private toDto(refund: OrderRefund): OrderRefundResponseDto {
    return {
      id: refund.id,
      orderId: refund.orderId,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
      note: refund.note,
      createdById: refund.createdById,
      reviewedById: refund.reviewedById,
      reviewedAt: refund.reviewedAt?.toISOString() ?? null,
      paymentTransactionId: refund.paymentTransactionId,
      occurredAt: refund.occurredAt.toISOString(),
      createdAt: refund.createdAt.toISOString(),
      updatedAt: refund.updatedAt.toISOString(),
    };
  }
}
