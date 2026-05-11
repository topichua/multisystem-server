import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Client,
  Company,
  Conversation,
  ConversationSource,
  Order,
  OrderDeliveryInfo,
  OrderEvent,
  OrderItem,
  OrderSource,
  OrderStatus,
  Product,
  ProductVariant,
  Workspace,
} from "../database/entities";
import type { AddOrderItemDto } from "./dto/add-order-item.dto";
import type { CreateOrderDto } from "./dto/create-order.dto";
import type { ListOrdersQueryDto } from "./dto/list-orders-query.dto";
import type { UpdateOrderDeliveryDto } from "./dto/update-order-delivery.dto";
import type { UpdateOrderStatusDto } from "./dto/update-order-status.dto";

export const OrderEventType = {
  ORDER_CREATED: "order.created",
  ITEM_ADDED: "order.item_added",
  STATUS_CHANGED: "order.status_changed",
  DELIVERY_UPDATED: "order.delivery_updated",
  TOTALS_UPDATED: "order.totals_updated",
} as const;

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function buildVariantTitleSnapshot(
  color: string | null,
  size: string | null,
): string | null {
  const parts = [color?.trim(), size?.trim()].filter(Boolean) as string[];
  if (parts.length === 0) return null;
  return parts.join(" / ").slice(0, 512);
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(OrderStatus)
    private readonly orderStatusRepo: Repository<OrderStatus>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(OrderDeliveryInfo)
    private readonly orderDeliveryRepo: Repository<OrderDeliveryInfo>,
    @InjectRepository(OrderEvent)
    private readonly orderEventRepo: Repository<OrderEvent>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
  ) {}

  async createOrder(ownerId: number, dto: CreateOrderDto): Promise<Order> {
    const company = await this.requireCompanyForOwner(ownerId);
    const workspaceId = company.workspaceId;
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });
    const currency = (
      dto.currency?.trim() ||
      workspace?.defaultCurrency?.trim() ||
      "UAH"
    ).slice(0, 8);

    const client = await this.clientRepo.findOne({
      where: { id: dto.customerId, workspaceId },
    });
    if (!client) {
      throw new BadRequestException(
        "Customer not found or not in your workspace",
      );
    }

    const conversationId: number | null = dto.conversationId ?? null;
    let source = dto.source;
    if (conversationId != null) {
      const conv = await this.conversationRepo.findOne({
        where: { id: conversationId },
        relations: { group: true },
      });
      if (!conv) {
        throw new NotFoundException("Conversation not found");
      }
      if (!conv.group || conv.group.workspaceId !== workspaceId) {
        throw new BadRequestException(
          "Conversation does not belong to your workspace",
        );
      }
      if (source == null) {
        source =
          conv.source === ConversationSource.INSTAGRAM
            ? OrderSource.instagram
            : OrderSource.manual;
      }
    } else {
      source = source ?? OrderSource.manual;
    }

    const defaultStatus = await this.orderStatusRepo.findOne({
      where: { workspaceId, isDefault: true },
    });
    if (!defaultStatus) {
      throw new ServiceUnavailableException(
        "No default order status for workspace; run migrations or contact support",
      );
    }

    const order = this.orderRepo.create({
      workspaceId,
      customerId: client.id,
      conversationId,
      source,
      statusId: defaultStatus.id,
      customerNote: dto.customerNote?.trim() || null,
      internalNote: dto.internalNote?.trim() || null,
      currency,
      subtotalAmount: 0,
      discountAmount: 0,
      deliveryAmount: 0,
      totalAmount: 0,
      createdById: ownerId,
      updatedById: null,
    });
    const saved = await this.orderRepo.save(order);
    await this.appendEvent(saved.id, OrderEventType.ORDER_CREATED, ownerId, {
      customerId: saved.customerId,
      conversationId: saved.conversationId,
      source: saved.source,
      statusId: saved.statusId,
      currency: saved.currency,
    });
    return this.getOrderById(ownerId, saved.id);
  }

  async addOrderItem(
    ownerId: number,
    orderId: number,
    dto: AddOrderItemDto,
  ): Promise<Order> {
    const company = await this.requireCompanyForOwner(ownerId);
    const order = await this.requireOrderForWorkspace(
      orderId,
      company.workspaceId,
    );

    const variant = await this.variantRepo.findOne({
      where: {
        id: dto.variantId,
        productId: dto.productId,
        companyId: company.id,
      },
      relations: { product: true },
    });
    if (!variant || !variant.product) {
      throw new BadRequestException("Variant not found for this integration");
    }
    const product = variant.product;
    const unitPrice = variant.price ?? product.price;
    if (unitPrice == null) {
      throw new BadRequestException(
        "Cannot price line item: variant and product have no price",
      );
    }
    const totalLine = roundMoney(unitPrice * dto.quantity);
    const variantTitle = buildVariantTitleSnapshot(variant.color, variant.size);
    const imageUrl =
      variant.imageUrl?.trim() || product.mainImageUrl?.trim() || null;

    const item = this.orderItemRepo.create({
      orderId: order.id,
      productId: product.id,
      variantId: variant.id,
      quantity: dto.quantity,
      unitPriceAmount: unitPrice,
      totalPriceAmount: totalLine,
      productTitleSnapshot: product.name.slice(0, 512),
      variantTitleSnapshot: variantTitle,
      skuSnapshot: variant.sku?.trim() || null,
      imageUrlSnapshot: imageUrl,
      variantAttributesSnapshot: {
        color: variant.color,
        size: variant.size,
      },
    });
    await this.orderItemRepo.save(item);

    await this.recalculateOrderTotals(order.id, ownerId);
    await this.appendEvent(order.id, OrderEventType.ITEM_ADDED, ownerId, {
      orderItemId: item.id,
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPriceAmount: item.unitPriceAmount,
      totalPriceAmount: item.totalPriceAmount,
    });
    return this.getOrderById(ownerId, order.id);
  }

  async updateOrderStatus(
    ownerId: number,
    orderId: number,
    dto: UpdateOrderStatusDto,
  ): Promise<Order> {
    const company = await this.requireCompanyForOwner(ownerId);
    const order = await this.requireOrderForWorkspace(
      orderId,
      company.workspaceId,
    );

    const newStatus = await this.orderStatusRepo.findOne({
      where: { id: dto.statusId, workspaceId: company.workspaceId },
    });
    if (!newStatus) {
      throw new BadRequestException(
        "Order status not found or not in your workspace",
      );
    }
    const previousStatusId = order.statusId;
    order.statusId = newStatus.id;
    order.updatedById = ownerId;
    await this.orderRepo.save(order);

    await this.appendEvent(order.id, OrderEventType.STATUS_CHANGED, ownerId, {
      previousStatusId,
      statusId: newStatus.id,
      statusName: newStatus.name,
    });
    return this.getOrderById(ownerId, order.id);
  }

  async updateDeliveryInfo(
    ownerId: number,
    orderId: number,
    dto: UpdateOrderDeliveryDto,
  ): Promise<Order> {
    const company = await this.requireCompanyForOwner(ownerId);
    const order = await this.requireOrderForWorkspace(
      orderId,
      company.workspaceId,
    );

    let row = await this.orderDeliveryRepo.findOne({
      where: { orderId: order.id },
    });
    if (!row) {
      row = this.orderDeliveryRepo.create({
        orderId: order.id,
        provider: dto.provider,
        recipientName: dto.recipientName ?? null,
        phone: dto.phone ?? null,
        city: dto.city ?? null,
        cityRef: dto.cityRef ?? null,
        warehouse: dto.warehouse ?? null,
        warehouseRef: dto.warehouseRef ?? null,
        address: dto.address ?? null,
        trackingNumber: dto.trackingNumber ?? null,
        rawProviderPayload: dto.rawProviderPayload ?? null,
      });
    } else {
      row.provider = dto.provider;
      if (dto.recipientName !== undefined)
        row.recipientName = dto.recipientName;
      if (dto.phone !== undefined) row.phone = dto.phone;
      if (dto.city !== undefined) row.city = dto.city;
      if (dto.cityRef !== undefined) row.cityRef = dto.cityRef;
      if (dto.warehouse !== undefined) row.warehouse = dto.warehouse;
      if (dto.warehouseRef !== undefined) row.warehouseRef = dto.warehouseRef;
      if (dto.address !== undefined) row.address = dto.address;
      if (dto.trackingNumber !== undefined) {
        row.trackingNumber = dto.trackingNumber;
      }
      if (dto.rawProviderPayload !== undefined) {
        row.rawProviderPayload = dto.rawProviderPayload;
      }
    }
    await this.orderDeliveryRepo.save(row);

    await this.appendEvent(order.id, OrderEventType.DELIVERY_UPDATED, ownerId, {
      deliveryInfoId: row.id,
      provider: row.provider,
      trackingNumber: row.trackingNumber,
    });
    return this.getOrderById(ownerId, order.id);
  }

  async getOrderById(ownerId: number, orderId: number): Promise<Order> {
    const company = await this.requireCompanyForOwner(ownerId);
    const order = await this.orderRepo.findOne({
      where: { id: orderId, workspaceId: company.workspaceId },
      relations: {
        items: true,
        status: true,
        customer: true,
        conversation: true,
        deliveryInfos: true,
        events: true,
      },
      order: { items: { id: "ASC" } },
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    if (order.events?.length) {
      order.events.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
    }
    this.stripCircularOrderRefs(order);
    return order;
  }

  /** Avoid JSON cycles (TypeORM may hydrate parent on children). */
  private stripCircularOrderRefs(order: Order): void {
    for (const i of order.items ?? []) {
      delete (i as unknown as { order?: unknown }).order;
    }
    for (const e of order.events ?? []) {
      delete (e as unknown as { order?: unknown }).order;
    }
    for (const d of order.deliveryInfos ?? []) {
      delete (d as unknown as { order?: unknown }).order;
    }
  }

  async listOrdersByWorkspace(
    ownerId: number,
    query: ListOrdersQueryDto,
  ): Promise<{
    items: Order[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const company = await this.requireCompanyForOwner(ownerId);
    const pageSize = query.pageSize ?? 50;
    const page = query.page ?? 1;
    const skip = (page - 1) * pageSize;
    const where: { workspaceId: number; statusId?: number } = {
      workspaceId: company.workspaceId,
    };
    if (query.statusId != null) {
      where.statusId = query.statusId;
    }
    const [items, total] = await this.orderRepo.findAndCount({
      where,
      relations: { status: true, customer: true },
      order: { createdAt: "DESC", id: "DESC" },
      take: pageSize,
      skip,
    });
    return { items, total, page, pageSize };
  }

  private async recalculateOrderTotals(
    orderId: number,
    actorId: number,
  ): Promise<void> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) return;
    const items = await this.orderItemRepo.find({ where: { orderId } });
    const subtotal = roundMoney(
      items.reduce((sum, i) => sum + Number(i.totalPriceAmount), 0),
    );
    const total = roundMoney(
      subtotal - Number(order.discountAmount) + Number(order.deliveryAmount),
    );
    order.subtotalAmount = subtotal;
    order.totalAmount = Math.max(0, total);
    order.updatedById = actorId;
    await this.orderRepo.save(order);
    await this.appendEvent(orderId, OrderEventType.TOTALS_UPDATED, actorId, {
      subtotalAmount: order.subtotalAmount,
      discountAmount: order.discountAmount,
      deliveryAmount: order.deliveryAmount,
      totalAmount: order.totalAmount,
    });
  }

  private async appendEvent(
    orderId: number,
    type: string,
    actorId: number | null,
    payload: Record<string, unknown> | null,
  ): Promise<void> {
    await this.orderEventRepo.save(
      this.orderEventRepo.create({
        orderId,
        type,
        actorId,
        payload,
      }),
    );
  }

  private async requireOrderForWorkspace(
    orderId: number,
    workspaceId: number,
  ): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, workspaceId },
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    return order;
  }

  private async requireCompanyForOwner(ownerId: number): Promise<Company> {
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain a numeric owner id",
      );
    }
    const company = await this.companyRepo.findOne({
      where: { ownerId },
      order: { id: "DESC" },
    });
    if (!company) {
      throw new NotFoundException(
        "Integration not found for current user; create a workspace first",
      );
    }
    return company;
  }
}
