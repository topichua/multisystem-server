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
  Conversation,
  ConversationSource,
  Order,
  OrderDeliveryInfo,
  OrderEvent,
  OrderItem,
  OrderDeliveryProvider,
  OrderDeliveryStatus,
  OrderSource,
  OrderStatus,
  Product,
  ProductVariant,
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
import type { ClientOrderStatDto } from "../clients/dto/client-order-stat.dto";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { VariantCustomFieldsService } from "../variant-custom-fields/variant-custom-fields.service";
import { InventoryService } from "../inventory/inventory.service";
import { InventoryMode } from "../database/entities/inventory-mode.enum";
import { WorkspaceSettingsService } from "../workspace-settings/workspace-settings.service";
import { NovaPoshtaWaybillService } from "../novaposhta-integrations/nova-poshta-waybill.service";
import type { CreateNovaPoshtaWaybillRequestDto } from "../novaposhta-integrations/dto/create-novaposhta-waybill.dto";
import type { CreateNovaPoshtaWaybillResponseDto } from "../novaposhta-integrations/dto/create-novaposhta-waybill.dto";
import {
  buildVariantAttributesSnapshot,
  buildVariantTitleFromFields,
} from "../variant-custom-fields/variant-custom-fields.util";
import { pickMainMediaUrl } from "../products/product-media.util";

export const OrderEventType = {
  ORDER_CREATED: "order.created",
  ITEM_ADDED: "order.item_added",
  STATUS_CHANGED: "order.status_changed",
  DELIVERY_UPDATED: "order.delivery_updated",
  WAYBILL_CREATED: "order.waybill_created",
  TOTALS_UPDATED: "order.totals_updated",
} as const;

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

type OrderStatsRawRow = {
  orderCount: string | number;
  totalSpent: string;
  averageOrderPrice: string;
  lastOrderAt: Date | null;
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly variantCustomFields: VariantCustomFieldsService,
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
    private readonly inventory: InventoryService,
    private readonly workspaceSettings: WorkspaceSettingsService,
    private readonly novaPoshtaWaybill: NovaPoshtaWaybillService,
  ) {}

  async createOrder(ownerId: number, dto: CreateOrderDto): Promise<Order> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const workspaceId = workspace.id;
    const currency = (
      dto.currency?.trim() ||
      workspace.defaultCurrency?.trim() ||
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
        await this.insertOrderLineItem(workspaceId, saved, line, ownerId);
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
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const order = await this.requireOrderForWorkspace(
      orderId,
      workspace.id,
    );

    await this.insertOrderLineItem(workspace.id, order, dto, ownerId);
    await this.recalculateOrderTotals(order.id, ownerId);
    const orderWithStatus = await this.orderRepo.findOne({
      where: { id: order.id },
      relations: { status: true },
    });
    if (orderWithStatus?.status) {
      await this.inventory.handleOrderInventoryForStatus(
        order.id,
        orderWithStatus.status.category,
        ownerId,
      );
    }
    return this.getOrderById(ownerId, order.id);
  }

  async listOrderStatusesForOwner(
    ownerId: number,
  ): Promise<OrderStatusResponseDto[]> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const rows = await this.orderStatusRepo.find({
      where: { workspaceId: workspace.id },
      order: { sortOrder: "ASC", id: "ASC" },
    });
    return rows.map((s) => this.toOrderStatusDto(s));
  }

  async setOrderStatusesOrderForOwner(
    ownerId: number,
    dto: SetOrderStatusesOrderDto,
  ): Promise<OrderStatusResponseDto[]> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const workspaceId = workspace.id;

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
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const workspaceId = workspace.id;

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

    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const workspaceId = workspace.id;

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
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const workspaceId = workspace.id;

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
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const order = await this.requireOrderForWorkspace(
      orderId,
      workspace.id,
    );

    const newStatus = await this.orderStatusRepo.findOne({
      where: { id: dto.statusId, workspaceId: workspace.id },
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
    await this.inventory.handleOrderInventoryForStatus(
      order.id,
      newStatus.category,
      ownerId,
    );
    return this.getOrderById(ownerId, order.id);
  }

  async updateDeliveryInfo(
    ownerId: number,
    orderId: number,
    dto: UpdateOrderDeliveryDto,
  ): Promise<Order> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const order = await this.requireOrderForWorkspace(
      orderId,
      workspace.id,
    );

    let row = await this.findDeliveryForOrder(order);
    if (!row) {
      row = this.orderDeliveryRepo.create({
        provider: dto.provider,
        ...this.mapDeliveryDtoToFields(dto, true),
      });
      row = await this.orderDeliveryRepo.save(row);
      order.deliveryId = row.id;
      order.deliveryType = dto.provider;
      order.updatedById = ownerId;
      await this.orderRepo.save(order);
    } else {
      Object.assign(row, this.mapDeliveryDtoToFields(dto, false));
      row.provider = dto.provider;
      await this.orderDeliveryRepo.save(row);
      if (order.deliveryType !== dto.provider) {
        order.deliveryType = dto.provider;
        order.updatedById = ownerId;
        await this.orderRepo.save(order);
      }
    }

    await this.appendEvent(order.id, OrderEventType.DELIVERY_UPDATED, ownerId, {
      deliveryInfoId: row.id,
      provider: row.provider,
      deliveryStatus: row.deliveryStatus,
      trackingNumber: row.trackingNumber,
      providerStatusCode: row.providerStatusCode,
    });
    return this.getOrderById(ownerId, order.id);
  }

  async createNovaPoshtaWaybill(
    ownerId: number,
    orderId: number,
    dto: CreateNovaPoshtaWaybillRequestDto = {},
  ): Promise<CreateNovaPoshtaWaybillResponseDto & { order: Order }> {
    const waybill = await this.novaPoshtaWaybill.createForOrder(
      ownerId,
      orderId,
      dto,
    );
    await this.appendEvent(orderId, OrderEventType.WAYBILL_CREATED, ownerId, {
      trackingNumber: waybill.trackingNumber,
      documentRef: waybill.documentRef,
    });
    const order = await this.getOrderById(ownerId, orderId);
    return { ...waybill, order };
  }

  async getOrderById(ownerId: number, orderId: number): Promise<Order> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const order = await this.orderRepo.findOne({
      where: { id: orderId, workspaceId: workspace.id },
      relations: {
        items: true,
        status: true,
        customer: true,
        conversation: true,
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
    order.deliveryInfo = await this.findDeliveryForOrder(order);
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
  }

  private async findDeliveryForOrder(
    order: Order,
  ): Promise<OrderDeliveryInfo | null> {
    if (order.deliveryId == null || order.deliveryType == null) {
      return null;
    }
    switch (order.deliveryType) {
      case OrderDeliveryProvider.nova_poshta:
      case OrderDeliveryProvider.ukrposhta:
      case OrderDeliveryProvider.manual:
      case OrderDeliveryProvider.other:
        return this.orderDeliveryRepo.findOne({
          where: { id: order.deliveryId },
        });
      default:
        return null;
    }
  }

  private async linkDeliveryToOrder(
    order: Order,
    delivery: OrderDeliveryInfo,
    deliveryType: OrderDeliveryProvider,
    ownerId: number,
  ): Promise<void> {
    order.deliveryId = delivery.id;
    order.deliveryType = deliveryType;
    order.updatedById = ownerId;
    await this.orderRepo.save(order);
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
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const pageSize = query.pageSize ?? 50;
    const page = query.page ?? 1;
    const skip = (page - 1) * pageSize;
    const workspaceId = workspace.id;

    const qb = this.orderRepo.createQueryBuilder("o").where(
      "o.workspaceId = :workspaceId",
      { workspaceId },
    );

    if (query.clientId != null) {
      const client = await this.clientRepo.findOne({
        where: { id: query.clientId, workspaceId },
      });
      if (!client) {
        throw new NotFoundException("Client not found");
      }
      qb.andWhere("o.customerId = :clientId", { clientId: query.clientId });
    }

    // status filters: prefer `statuses` array, fall back to single statusId for compatibility
    const statuses = (query as any).statuses ?? (query as any).statuses;
    if (Array.isArray((query as any).statuses) && (query as any).statuses.length > 0) {
      qb.andWhere("o.statusId IN (:...statuses)", { statuses: (query as any).statuses });
    } else if ((query as any).statusId != null) {
      qb.andWhere("o.statusId = :statusId", { statusId: (query as any).statusId });
    }

    // created at range
    if (query.createdFrom) {
      qb.andWhere("o.createdAt >= :createdFrom", { createdFrom: query.createdFrom });
    }
    if (query.createdTo) {
      qb.andWhere("o.createdAt <= :createdTo", { createdTo: query.createdTo });
    }

    // total amount range
    if (query.totalPriceFrom != null) {
      qb.andWhere("o.totalAmount >= :totalPriceFrom", { totalPriceFrom: query.totalPriceFrom });
    }
    if (query.totalPriceTo != null) {
      qb.andWhere("o.totalAmount <= :totalPriceTo", { totalPriceTo: query.totalPriceTo });
    }

    // sources filter (instagram, telegram, manual)
    if (Array.isArray(query.sources) && query.sources.length > 0) {
      // Normalize values to match stored enum strings
      const srcs = query.sources.map((s) => String(s).trim()).filter((s) => s.length > 0);
      if (srcs.length > 0) {
        qb.andWhere("o.source IN (:...sources)", { sources: srcs });
      }
    }

    qb.orderBy("o.createdAt", "DESC").addOrderBy("o.id", "DESC");

    const [items, total] = await qb
      .take(pageSize)
      .skip(skip)
      .leftJoinAndSelect("o.status", "status")
      .leftJoinAndSelect("o.customer", "customer")
      .getManyAndCount();

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
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const workspaceId = workspace.id;

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
      .getRawOne<OrderStatsRawRow>();

    const stats = this.parseOrderStatsRaw(raw);

    return {
      clientId,
      ...stats,
    };
  }

  async getOrderStatsMapForClientIds(
    workspaceId: number,
    clientIds: number[],
  ): Promise<Map<number, ClientOrderStatDto>> {
    const uniqueIds = [...new Set(clientIds.filter((id) => id > 0))];
    const map = new Map<number, ClientOrderStatDto>();
    for (const id of uniqueIds) {
      map.set(id, this.emptyOrderStats());
    }
    if (uniqueIds.length === 0) {
      return map;
    }

    const rows = await this.orderRepo
      .createQueryBuilder("o")
      .select("o.customerId", "clientId")
      .addSelect("COUNT(o.id)::int", "orderCount")
      .addSelect("COALESCE(SUM(o.totalAmount), 0)", "totalSpent")
      .addSelect("COALESCE(AVG(o.totalAmount), 0)", "averageOrderPrice")
      .addSelect("MAX(o.createdAt)", "lastOrderAt")
      .where("o.workspaceId = :workspaceId", { workspaceId })
      .andWhere("o.customerId IN (:...clientIds)", { clientIds: uniqueIds })
      .groupBy("o.customerId")
      .getRawMany<OrderStatsRawRow & { clientId: string | number }>();

    for (const raw of rows) {
      const clientId = Number(raw.clientId);
      if (!Number.isInteger(clientId) || clientId <= 0) {
        continue;
      }
      map.set(clientId, this.parseOrderStatsRaw(raw));
    }

    return map;
  }

  private emptyOrderStats(): ClientOrderStatDto {
    return {
      orderCount: 0,
      totalSpent: 0,
      averageOrderPrice: 0,
      lastOrderAt: null,
    };
  }

  private parseOrderStatsRaw(
    raw: OrderStatsRawRow | null | undefined,
  ): ClientOrderStatDto {
    const orderCount = Number(raw?.orderCount ?? 0);
    const totalSpent = roundMoney(Number(raw?.totalSpent ?? 0));
    const averageOrderPrice =
      orderCount > 0 ? roundMoney(Number(raw?.averageOrderPrice ?? 0)) : 0;

    return {
      orderCount,
      totalSpent,
      averageOrderPrice,
      lastOrderAt: raw?.lastOrderAt ?? null,
    };
  }

  private async insertOrderLineItem(
    workspaceId: number,
    order: Order,
    dto: AddOrderItemDto,
    ownerId: number,
  ): Promise<OrderItem> {
    const variant = await this.variantRepo.findOne({
      where: {
        id: dto.variantId,
        productId: dto.productId,
      },
      relations: { product: { media: true }, media: true, customFieldValues: true },
    });
    if (
      !variant ||
      !variant.product ||
      variant.product.workspaceId !== workspaceId
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
    const fieldDefs =
      await this.variantCustomFields.listDefinitionsForWorkspace(workspaceId);
    const variantTitleRaw = buildVariantTitleFromFields(fieldDefs, variant);
    const variantTitle = variantTitleRaw?.slice(0, 512) ?? null;
    const productMainImage = pickMainMediaUrl(
      (product.media ?? []).filter((m) => m.variantId == null),
    );
    const variantMainImage = pickMainMediaUrl(variant.media ?? []);
    const imageUrl = variantMainImage || productMainImage || null;

    const unitCost = (
      await this.inventory.getStockMapForVariantIds(workspaceId, [variant.id])
    ).get(variant.id)?.avgPurchasePrice ?? null;

    const mode =
      await this.workspaceSettings.getInventoryModeForWorkspace(workspaceId);
    const costUnit =
      mode === InventoryMode.advanced ? unitCost : null;

    const costSnapshots = this.inventory.buildOrderItemCostSnapshots(
      unitPrice,
      dto.quantity,
      costUnit,
    );

    await this.inventory.assertVariantSellable(
      workspaceId,
      variant.id,
      dto.quantity,
    );

    const item = this.orderItemRepo.create({
      orderId: order.id,
      productId: product.id,
      variantId: variant.id,
      quantity: dto.quantity,
      unitPriceAmount: unitPrice,
      totalPriceAmount: totalLine,
      unitPriceSnapshot: costSnapshots.unitPriceSnapshot,
      unitCostSnapshot: costSnapshots.unitCostSnapshot,
      totalSaleAmount: costSnapshots.totalSaleAmount,
      totalCostAmount: costSnapshots.totalCostAmount,
      profitAmount: costSnapshots.profitAmount,
      productTitleSnapshot: product.name.slice(0, 512),
      variantTitleSnapshot: variantTitle,
      skuSnapshot: variant.sku?.trim() || null,
      imageUrlSnapshot: imageUrl,
      variantAttributesSnapshot: buildVariantAttributesSnapshot(
        fieldDefs,
        variant,
      ),
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
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) {
      return;
    }
    const row = await this.orderDeliveryRepo.save(
      this.orderDeliveryRepo.create({
        provider: dto.provider,
        ...this.mapDeliveryDtoToFields(dto, true),
      }),
    );
    await this.linkDeliveryToOrder(order, row, dto.provider, ownerId);
    await this.appendEvent(orderId, OrderEventType.DELIVERY_UPDATED, ownerId, {
      deliveryInfoId: row.id,
      deliveryType: dto.provider,
      provider: row.provider,
      deliveryStatus: row.deliveryStatus,
      trackingNumber: row.trackingNumber,
    });
  }

  private mapDeliveryDtoToFields(
    dto: UpdateOrderDeliveryDto,
    isCreate: boolean,
  ): Partial<OrderDeliveryInfo> {
    const patch: Partial<OrderDeliveryInfo> = {
      providerId: dto.providerId ?? null,
      deliveryStatus: dto.deliveryStatus ?? OrderDeliveryStatus.pending,
      recipientName: dto.recipientName ?? null,
      phone: dto.phone ?? null,
      city: dto.city ?? null,
      cityRef: dto.cityRef ?? null,
      warehouse: dto.warehouse ?? null,
      warehouseRef: dto.warehouseRef ?? null,
      deliveryType: dto.deliveryType ?? null,
      street: dto.street ?? null,
      streetRef: dto.streetRef ?? null,
      building: dto.building ?? null,
      flat: dto.flat ?? null,
      trackingNumber: dto.trackingNumber ?? null,
      providerStatusCode: dto.providerStatusCode ?? null,
      providerStatusText: dto.providerStatusText ?? null,
      providerDocumentRef: dto.providerDocumentRef ?? null,
      isCashOnDelivery: dto.isCashOnDelivery ?? false,
      cashOnDeliveryAmount:
        dto.isCashOnDelivery === false
          ? null
          : (dto.cashOnDeliveryAmount ?? null),
    };

    if (!isCreate) {
      const optionalKeys = [
        "providerId",
        "deliveryStatus",
        "recipientName",
        "phone",
        "city",
        "cityRef",
        "warehouse",
        "warehouseRef",
        "deliveryType",
        "street",
        "streetRef",
        "building",
        "flat",
        "trackingNumber",
        "providerStatusCode",
        "providerStatusText",
        "providerDocumentRef",
        "isCashOnDelivery",
        "cashOnDeliveryAmount",
      ] as const;
      for (const key of optionalKeys) {
        if (dto[key] === undefined) {
          delete patch[key];
        }
      }
      if (dto.isCashOnDelivery === false) {
        patch.cashOnDeliveryAmount = null;
      }
    }

    return patch;
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
        userId: actorId,
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

}
