import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Client,
  InstagramIntegration,
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
import type { CreateOrderStatusDefinitionDto } from "./dto/create-order-status-definition.dto";
import type { ListOrdersQueryDto } from "./dto/list-orders-query.dto";
import type { UpdateOrderDeliveryDto } from "./dto/update-order-delivery.dto";
import type { OrderStatusResponseDto } from "./dto/order-status-response.dto";
import type { UpdateOrderStatusDefinitionDto } from "./dto/update-order-status-definition.dto";
import type { SetOrderStatusesOrderDto } from "./dto/set-order-statuses-order.dto";
import type { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import type { ClientOrderStatsResponseDto } from "../clients/dto/client-order-stats-response.dto";

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
    @InjectRepository(InstagramIntegration)
    private readonly companyRepo: Repository<InstagramIntegration>,
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

    const rawConv = dto.conversationId;
    const conversationId =
      rawConv != null && Number.isInteger(rawConv) && rawConv >= 1
        ? rawConv
        : null;
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

    const statusId = await this.resolveDefaultOrderStatusId(workspaceId);

    const order = this.orderRepo.create({
      workspaceId,
      customerId: client.id,
      conversationId,
      source,
      statusId,
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

    const lineItems = dto.items ?? [];
    if (lineItems.length > 0) {
      for (const line of lineItems) {
        await this.insertOrderLineItem(company, saved, line, ownerId);
      }
      await this.recalculateOrderTotals(saved.id, ownerId);
    }

    if (dto.delivery) {
      await this.createDeliveryForOrder(saved.id, dto.delivery, ownerId);
    }

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

    await this.insertOrderLineItem(company, order, dto, ownerId);
    await this.recalculateOrderTotals(order.id, ownerId);
    return this.getOrderById(ownerId, order.id);
  }

  async listOrderStatusesForOwner(
    ownerId: number,
  ): Promise<OrderStatusResponseDto[]> {
    const company = await this.requireCompanyForOwner(ownerId);
    const rows = await this.orderStatusRepo.find({
      where: { workspaceId: company.workspaceId },
      order: { sortOrder: "ASC", id: "ASC" },
    });
    return rows.map((s) => this.toOrderStatusDto(s));
  }

  async setOrderStatusesOrderForOwner(
    ownerId: number,
    dto: SetOrderStatusesOrderDto,
  ): Promise<OrderStatusResponseDto[]> {
    const company = await this.requireCompanyForOwner(ownerId);
    const workspaceId = company.workspaceId;

    const uniqueIds = new Set(dto.ids);
    if (uniqueIds.size !== dto.ids.length) {
      throw new BadRequestException("ids must not contain duplicates");
    }

    return this.orderStatusRepo.manager.transaction(async (em) => {
      const rows = await em.find(OrderStatus, {
        where: { workspaceId },
      });
      if (rows.length === 0) {
        throw new BadRequestException("No order statuses in workspace");
      }
      if (dto.ids.length !== rows.length) {
        throw new BadRequestException(
          `ids must include every workspace status exactly once (expected ${rows.length}, got ${dto.ids.length})`,
        );
      }

      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const id of dto.ids) {
        if (!byId.has(id)) {
          throw new BadRequestException(`Order status ${id} not found in workspace`);
        }
      }

      for (let i = 0; i < dto.ids.length; i++) {
        const row = byId.get(dto.ids[i])!;
        row.sortOrder = i;
        await em.save(row);
      }

      const updated = await em.find(OrderStatus, {
        where: { workspaceId },
        order: { sortOrder: "ASC", id: "ASC" },
      });
      return updated.map((s) => this.toOrderStatusDto(s));
    });
  }

  async createOrderStatusDefinitionForOwner(
    ownerId: number,
    dto: CreateOrderStatusDefinitionDto,
  ): Promise<OrderStatusResponseDto> {
    const company = await this.requireCompanyForOwner(ownerId);
    const workspaceId = company.workspaceId;

    return this.orderStatusRepo.manager.transaction(async (em) => {
      const raw = await em
        .createQueryBuilder(OrderStatus, "s")
        .select("COALESCE(MAX(s.sortOrder), -1)", "maxSort")
        .where("s.workspaceId = :workspaceId", { workspaceId })
        .getRawOne<{ maxSort: string | number }>();
      const sortOrder = Number(raw?.maxSort ?? -1) + 1;

      const status = em.create(OrderStatus, {
        workspaceId,
        name: dto.name.trim(),
        category: dto.category,
        color: dto.color ?? null,
        sortOrder,
        isDefault: false,
        isSystem: false,
      });

      if (dto.isDefault === true) {
        await em.update(
          OrderStatus,
          { workspaceId, isDefault: true },
          { isDefault: false },
        );
        status.isDefault = true;
      }

      const saved = await em.save(status);
      return this.toOrderStatusDto(saved);
    });
  }

  async updateOrderStatusDefinitionForOwner(
    ownerId: number,
    statusId: number,
    dto: UpdateOrderStatusDefinitionDto,
  ): Promise<OrderStatusResponseDto> {
    if (
      dto.name === undefined &&
      dto.color === undefined &&
      dto.category === undefined &&
      dto.isDefault === undefined
    ) {
      throw new BadRequestException(
        "Provide at least one of: name, color, category, isDefault",
      );
    }

    const company = await this.requireCompanyForOwner(ownerId);
    const workspaceId = company.workspaceId;

    return this.orderStatusRepo.manager.transaction(async (em) => {
      const status = await em.findOne(OrderStatus, {
        where: { id: statusId, workspaceId },
      });
      if (!status) {
        throw new NotFoundException("Order status not found");
      }

      if (dto.category !== undefined) {
        if (status.isSystem) {
          throw new BadRequestException(
            "Cannot change category on a system status",
          );
        }
        status.category = dto.category;
      }
      if (dto.name !== undefined) {
        status.name = dto.name.trim();
      }
      if (dto.color !== undefined) {
        status.color = dto.color;
      }
      if (dto.isDefault === true) {
        await em.update(
          OrderStatus,
          { workspaceId, isDefault: true },
          { isDefault: false },
        );
        status.isDefault = true;
      } else if (dto.isDefault === false) {
        status.isDefault = false;
      }

      const saved = await em.save(status);
      return this.toOrderStatusDto(saved);
    });
  }

  async deleteOrderStatusDefinitionForOwner(
    ownerId: number,
    statusId: number,
  ): Promise<void> {
    const company = await this.requireCompanyForOwner(ownerId);
    const workspaceId = company.workspaceId;

    const status = await this.orderStatusRepo.findOne({
      where: { id: statusId, workspaceId },
    });
    if (!status) {
      throw new NotFoundException("Order status not found");
    }
    if (status.isSystem) {
      throw new BadRequestException("System order statuses cannot be deleted");
    }
    if (status.isDefault) {
      throw new BadRequestException(
        "Cannot delete the default status; set another status as default first",
      );
    }

    const ordersUsing = await this.orderRepo.count({
      where: { statusId: status.id, workspaceId },
    });
    if (ordersUsing > 0) {
      throw new ConflictException(
        `Cannot delete status: ${ordersUsing} order(s) still use it`,
      );
    }

    await this.orderStatusRepo.remove(status);
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
    const where: {
      workspaceId: number;
      statusId?: number;
      customerId?: number;
    } = {
      workspaceId: company.workspaceId,
    };
    if (query.clientId != null) {
      const client = await this.clientRepo.findOne({
        where: { id: query.clientId, workspaceId: company.workspaceId },
      });
      if (!client) {
        throw new NotFoundException("Client not found");
      }
      where.customerId = query.clientId;
    }
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

  async listOrdersForClient(
    ownerId: number,
    clientId: number,
    query: ListOrdersQueryDto,
  ): Promise<{
    items: Order[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    return this.listOrdersByWorkspace(ownerId, { ...query, clientId });
  }

  async getOrderStatsForClient(
    ownerId: number,
    clientId: number,
  ): Promise<ClientOrderStatsResponseDto> {
    const company = await this.requireCompanyForOwner(ownerId);
    const workspaceId = company.workspaceId;

    const client = await this.clientRepo.findOne({
      where: { id: clientId, workspaceId },
    });
    if (!client) {
      throw new NotFoundException("Client not found");
    }

    const raw = await this.orderRepo
      .createQueryBuilder("o")
      .select("COUNT(o.id)::int", "orderCount")
      .addSelect("COALESCE(SUM(o.totalAmount), 0)", "totalSpent")
      .addSelect("COALESCE(AVG(o.totalAmount), 0)", "averageOrderPrice")
      .addSelect("MAX(o.createdAt)", "lastOrderAt")
      .where("o.workspaceId = :workspaceId", { workspaceId })
      .andWhere("o.customerId = :clientId", { clientId })
      .getRawOne<{
        orderCount: string | number;
        totalSpent: string;
        averageOrderPrice: string;
        lastOrderAt: Date | null;
      }>();

    const orderCount = Number(raw?.orderCount ?? 0);
    const totalSpent = roundMoney(Number(raw?.totalSpent ?? 0));
    const averageOrderPrice =
      orderCount > 0 ? roundMoney(Number(raw?.averageOrderPrice ?? 0)) : 0;

    return {
      clientId,
      orderCount,
      totalSpent,
      averageOrderPrice,
      lastOrderAt: raw?.lastOrderAt ?? null,
    };
  }

  private async insertOrderLineItem(
    company: InstagramIntegration,
    order: Order,
    dto: AddOrderItemDto,
    ownerId: number,
  ): Promise<OrderItem> {
    const variant = await this.variantRepo.findOne({
      where: {
        id: dto.variantId,
        productId: dto.productId,
      },
      relations: { product: true },
    });
    if (
      !variant ||
      !variant.product ||
      variant.product.workspaceId !== company.workspaceId
    ) {
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
    const saved = await this.orderItemRepo.save(item);

    await this.appendEvent(order.id, OrderEventType.ITEM_ADDED, ownerId, {
      orderItemId: saved.id,
      productId: saved.productId,
      variantId: saved.variantId,
      quantity: saved.quantity,
      unitPriceAmount: saved.unitPriceAmount,
      totalPriceAmount: saved.totalPriceAmount,
    });
    return saved;
  }

  private async createDeliveryForOrder(
    orderId: number,
    dto: UpdateOrderDeliveryDto,
    ownerId: number,
  ): Promise<void> {
    const row = this.orderDeliveryRepo.create({
      orderId,
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
    await this.orderDeliveryRepo.save(row);
    await this.appendEvent(orderId, OrderEventType.DELIVERY_UPDATED, ownerId, {
      deliveryInfoId: row.id,
      provider: row.provider,
      trackingNumber: row.trackingNumber,
    });
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

  /** Workspace row with `is_default = true` (set via PATCH /orders/statuses/:id). */
  private async resolveDefaultOrderStatusId(
    workspaceId: number,
  ): Promise<number> {
    const defaultStatus = await this.orderStatusRepo.findOne({
      where: { workspaceId, isDefault: true },
    });
    if (!defaultStatus) {
      throw new ServiceUnavailableException(
        "No default order status for workspace; mark one status as default in order settings",
      );
    }
    return defaultStatus.id;
  }

  private toOrderStatusDto(row: OrderStatus): OrderStatusResponseDto {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      category: row.category,
      color: row.color,
      sortOrder: row.sortOrder,
      isDefault: row.isDefault,
      isSystem: row.isSystem,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async requireCompanyForOwner(ownerId: number): Promise<InstagramIntegration> {
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
