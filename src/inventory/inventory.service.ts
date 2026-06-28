import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import {
  InventoryMovement,
  InventoryMovementReason,
  InventoryMovementType,
  InventoryReservation,
  InventoryReservationStatus,
  Order,
  OrderItem,
  OrderStatusCategory,
  Product,
  ProductVariant,
} from "../database/entities";
import { VariantCustomFieldsService } from "../variant-custom-fields/variant-custom-fields.service";
import { buildVariantTitleFromFields } from "../variant-custom-fields/variant-custom-fields.util";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { WorkspacePermissionsService } from "../workspace-access/workspace-permissions.service";
import { WorkspaceSettingsService } from "../workspace-settings/workspace-settings.service";
import type { CreateInventoryMovementRequestDto } from "./dto/create-inventory-movement-request.dto";
import type {
  CreateInventoryMovementResponseDto,
  InventoryMovementItemDto,
  InventoryMovementListResponseDto,
  InventoryVariantStateDto,
} from "./dto/inventory-movement-response.dto";
import type { ProductInventoryResponseDto } from "./dto/product-inventory-response.dto";
import type { InventoryMovementCriteriaResponseDto } from "./dto/inventory-criteria-response.dto";
import {
  assertReasonAllowedForType,
  computeDecreaseStock,
  computeIncreaseStock,
  computeSetStock,
  resolveIncreasePurchasePrice,
  type StockState,
  buildInventoryMovementCriteria,
} from "./inventory-movement.logic";
import {
  assertInventoryMovementsAllowed,
  managesStockOnOrders,
} from "./inventory-mode.util";
import { InventoryMode } from "../database/entities/inventory-mode.enum";
import {
  computeAvailableQuantity,
  toVariantInventoryQuantities,
  variantPhysicalQuantity,
  variantReservedQuantity,
} from "./inventory-quantity.util";

@Injectable()
export class InventoryService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(InventoryMovement)
    private readonly movementRepo: Repository<InventoryMovement>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly permissions: WorkspacePermissionsService,
    private readonly workspaceSettings: WorkspaceSettingsService,
    private readonly variantCustomFields: VariantCustomFieldsService,
  ) {}

  getMovementCriteria(): InventoryMovementCriteriaResponseDto {
    return buildInventoryMovementCriteria();
  }

  async getProductInventory(
    userId: number,
    productId: number,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<ProductInventoryResponseDto> {
    await this.requireInventoryView(userId, appRole, workspaceIdParam);
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      userId,
      appRole,
      workspaceIdParam,
    );
    assertInventoryMovementsAllowed(workspace.inventoryMode ?? InventoryMode.off);
    const product = await this.productRepo.findOne({
      where: { id: productId, workspaceId: workspace.id },
    });
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const variants = await this.variantRepo.find({
      where: { productId: product.id },
      order: { id: "ASC" },
      relations: { customFieldValues: true },
    });
    const fieldDefs =
      await this.variantCustomFields.listDefinitionsForWorkspace(workspace.id);

    return {
      productId: product.id,
      variants: variants.map((variant) => {
        const quantities = toVariantInventoryQuantities(variant);
        return {
          variantId: variant.id,
          sku: variant.sku,
          name: buildVariantTitleFromFields(fieldDefs, variant),
          price: variant.price,
          quantity: quantities.quantity,
          reservedQuantity: quantities.reservedQuantity,
          availableQuantity: quantities.availableQuantity,
          stockQty: quantities.quantity,
          stockCostTotal: Number(variant.stockCostTotal),
          averagePurchasePrice: variant.averagePurchasePrice,
        };
      }),
    };
  }

  async listVariantMovements(
    userId: number,
    variantId: number,
    limit: number,
    offset: number,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<InventoryMovementListResponseDto> {
    await this.requireInventoryView(userId, appRole, workspaceIdParam);
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      userId,
      appRole,
      workspaceIdParam,
    );
    assertInventoryMovementsAllowed(workspace.inventoryMode ?? InventoryMode.off);
    const variant = await this.variantRepo.findOne({
      where: { id: variantId },
      relations: { product: true },
    });
    if (!variant?.product || variant.product.workspaceId !== workspace.id) {
      throw new NotFoundException("Variant not found");
    }

    const [rows, total] = await this.movementRepo.findAndCount({
      where: { variantId: variant.id, workspaceId: workspace.id },
      relations: { createdByUser: true },
      order: { createdAt: "DESC", id: "DESC" },
      take: limit,
      skip: offset,
    });

    return {
      items: rows.map((row) => this.toMovementDto(row)),
      total,
    };
  }

  async createMovement(
    userId: number,
    dto: CreateInventoryMovementRequestDto,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<CreateInventoryMovementResponseDto> {
    await this.requireInventoryManage(userId, appRole, workspaceIdParam);
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      userId,
      appRole,
      workspaceIdParam,
    );
    assertInventoryMovementsAllowed(workspace.inventoryMode ?? InventoryMode.off);

    const result = await this.applyMovement({
      variantId: dto.variantId,
      workspaceId: workspace.id,
      type: dto.type,
      reason: dto.reason,
      quantity: dto.quantity,
      purchasePrice: dto.purchasePrice ?? null,
      comment: dto.comment ?? null,
      createdByUserId: userId,
    });

    const movementWithUser = await this.movementRepo.findOne({
      where: { id: result.movement.id },
      relations: { createdByUser: true },
    });

    return {
      movement: this.toMovementDto(movementWithUser ?? result.movement),
      variant: this.toVariantStateDto(result.variant),
    };
  }

  async handleOrderInventoryForStatus(
    orderId: number,
    statusCategory: OrderStatusCategory,
    actorUserId: number | null,
  ): Promise<void> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: { items: true },
    });
    if (!order) {
      return;
    }

    const mode = await this.workspaceSettings.getInventoryModeForWorkspace(
      order.workspaceId,
    );
    if (!managesStockOnOrders(mode)) {
      return;
    }

    switch (statusCategory) {
      case OrderStatusCategory.confirmed:
        await this.reserveStockForOrder(order, actorUserId);
        break;
      case OrderStatusCategory.shipped:
        await this.shipStockForOrder(order, actorUserId, mode);
        break;
      case OrderStatusCategory.canceled:
        await this.releaseStockForOrder(order, actorUserId);
        break;
      default:
        break;
    }
  }

  /** @deprecated Use handleOrderInventoryForStatus */
  async deductStockForOrder(
    orderId: number,
    actorUserId: number | null,
  ): Promise<void> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: { status: true },
    });
    if (!order?.status) {
      return;
    }
    await this.handleOrderInventoryForStatus(
      orderId,
      order.status.category,
      actorUserId,
    );
  }

  private async reserveStockForOrder(
    order: Order,
    actorUserId: number | null,
  ): Promise<void> {
    for (const item of order.items ?? []) {
      await this.dataSource.transaction(async (em) => {
        await this.reserveOrderItem(em, order, item.id, actorUserId);
      });
    }
  }

  private async shipStockForOrder(
    order: Order,
    actorUserId: number | null,
    mode: InventoryMode,
  ): Promise<void> {
    for (const item of order.items ?? []) {
      await this.dataSource.transaction(async (em) => {
        await this.shipOrderItem(em, order, item.id, actorUserId, mode);
      });
    }
  }

  private async releaseStockForOrder(
    order: Order,
    actorUserId: number | null,
  ): Promise<void> {
    for (const item of order.items ?? []) {
      await this.dataSource.transaction(async (em) => {
        await this.releaseOrderItem(em, order, item.id, actorUserId);
      });
    }
  }

  private async reserveOrderItem(
    em: EntityManager,
    order: Order,
    orderItemId: number,
    actorUserId: number | null,
  ): Promise<void> {
    const lockedItem = await em.findOne(OrderItem, {
      where: { id: orderItemId },
      lock: { mode: "pessimistic_write" },
    });
    if (!lockedItem || lockedItem.stockReservedAt != null) {
      return;
    }

    const variant = await em.findOne(ProductVariant, {
      where: { id: lockedItem.variantId },
      relations: { product: true },
      lock: { mode: "pessimistic_write" },
    });
    if (!variant?.product) {
      throw new NotFoundException("Variant not found");
    }

    const available = computeAvailableQuantity(variant);
    if (available < lockedItem.quantity) {
      throw new BadRequestException(
        `Insufficient available stock for variant ${variant.id}`,
      );
    }

    const now = new Date();
    await em.save(
      em.create(InventoryReservation, {
        workspaceId: order.workspaceId,
        productId: lockedItem.productId,
        variantId: lockedItem.variantId,
        orderId: order.id,
        orderItemId: lockedItem.id,
        quantity: lockedItem.quantity,
        status: InventoryReservationStatus.active,
        reservedByUserId: actorUserId,
        reservedAt: now,
      }),
    );

    variant.reservedQuantity =
      variantReservedQuantity(variant) + lockedItem.quantity;
    await em.save(ProductVariant, variant);

    lockedItem.stockReservedAt = now;
    await em.save(OrderItem, lockedItem);
  }

  private async shipOrderItem(
    em: EntityManager,
    order: Order,
    orderItemId: number,
    actorUserId: number | null,
    mode: InventoryMode,
  ): Promise<void> {
    const lockedItem = await em.findOne(OrderItem, {
      where: { id: orderItemId },
      lock: { mode: "pessimistic_write" },
    });
    if (!lockedItem || lockedItem.stockDeductedAt != null) {
      return;
    }

    const reservation = await em.findOne(InventoryReservation, {
      where: {
        orderItemId: lockedItem.id,
        status: InventoryReservationStatus.active,
      },
      lock: { mode: "pessimistic_write" },
    });
    if (!reservation) {
      throw new BadRequestException(
        `No active stock reservation for order item ${lockedItem.id}`,
      );
    }

    const variant = await em.findOne(ProductVariant, {
      where: { id: lockedItem.variantId },
      relations: { product: true },
      lock: { mode: "pessimistic_write" },
    });
    if (!variant?.product) {
      throw new NotFoundException("Variant not found");
    }

    const quantityBefore = variantPhysicalQuantity(variant);
    const reservedBefore = variantReservedQuantity(variant);
    const nextQuantity = quantityBefore - lockedItem.quantity;
    const nextReserved = reservedBefore - lockedItem.quantity;

    if (nextQuantity < 0 || nextReserved < 0) {
      throw new BadRequestException("Stock quantity cannot become negative");
    }

    const before: StockState = {
      quantity: quantityBefore,
      stockCostTotal: Number(variant.stockCostTotal),
      averagePurchasePrice: variant.averagePurchasePrice,
    };

    variant.quantity = nextQuantity;
    variant.reservedQuantity = nextReserved;

    if (mode === InventoryMode.advanced) {
      const after = computeDecreaseStock(before, lockedItem.quantity);
      variant.stockCostTotal = after.stockCostTotal;
      variant.averagePurchasePrice = after.averagePurchasePrice;

      await em.save(
        em.create(InventoryMovement, {
          workspaceId: order.workspaceId,
          productId: variant.productId,
          variantId: variant.id,
          type: InventoryMovementType.decrease,
          reason: InventoryMovementReason.orderSale,
          quantityDelta: -lockedItem.quantity,
          quantityBefore,
          quantityAfter: nextQuantity,
          purchasePrice: null,
          stockCostBefore: before.stockCostTotal,
          stockCostAfter: after.stockCostTotal,
          averagePurchasePriceBefore: before.averagePurchasePrice,
          averagePurchasePriceAfter: after.averagePurchasePrice,
          comment: null,
          orderId: order.id,
          orderItemId: lockedItem.id,
          createdByUserId: actorUserId,
        }),
      );
    }

    await em.save(ProductVariant, variant);

    const now = new Date();
    reservation.status = InventoryReservationStatus.deducted;
    reservation.deductedByUserId = actorUserId;
    reservation.deductedAt = now;
    await em.save(InventoryReservation, reservation);

    lockedItem.stockDeductedAt = now;
    await em.save(OrderItem, lockedItem);
  }

  private async releaseOrderItem(
    em: EntityManager,
    order: Order,
    orderItemId: number,
    actorUserId: number | null,
  ): Promise<void> {
    const lockedItem = await em.findOne(OrderItem, {
      where: { id: orderItemId },
      lock: { mode: "pessimistic_write" },
    });
    if (!lockedItem || lockedItem.stockDeductedAt != null) {
      return;
    }
    if (lockedItem.stockReleasedAt != null) {
      return;
    }

    const reservation = await em.findOne(InventoryReservation, {
      where: {
        orderItemId: lockedItem.id,
        status: InventoryReservationStatus.active,
      },
      lock: { mode: "pessimistic_write" },
    });
    if (!reservation) {
      return;
    }

    const variant = await em.findOne(ProductVariant, {
      where: { id: lockedItem.variantId },
      lock: { mode: "pessimistic_write" },
    });
    if (!variant) {
      throw new NotFoundException("Variant not found");
    }

    const nextReserved = variantReservedQuantity(variant) - reservation.quantity;
    if (nextReserved < 0) {
      throw new BadRequestException(
        "Reserved quantity cannot become negative",
      );
    }

    variant.reservedQuantity = nextReserved;
    await em.save(ProductVariant, variant);

    const now = new Date();
    reservation.status = InventoryReservationStatus.released;
    reservation.releasedByUserId = actorUserId;
    reservation.releasedAt = now;
    await em.save(InventoryReservation, reservation);

    lockedItem.stockReleasedAt = now;
    await em.save(OrderItem, lockedItem);
  }

  buildOrderItemCostSnapshots(
    unitPrice: number,
    quantity: number,
    unitCost: number | null,
  ): {
    unitPriceSnapshot: number;
    unitCostSnapshot: number | null;
    totalSaleAmount: number;
    totalCostAmount: number | null;
    profitAmount: number | null;
  } {
    const unitPriceSnapshot = unitPrice;
    const unitCostSnapshot = unitCost;
    const totalSaleAmount = Math.round((unitPriceSnapshot * quantity + Number.EPSILON) * 100) / 100;
    if (unitCostSnapshot == null) {
      return {
        unitPriceSnapshot,
        unitCostSnapshot: null,
        totalSaleAmount,
        totalCostAmount: null,
        profitAmount: null,
      };
    }
    const totalCostAmount =
      Math.round((unitCostSnapshot * quantity + Number.EPSILON) * 100) / 100;
    const profitAmount =
      Math.round((totalSaleAmount - totalCostAmount + Number.EPSILON) * 100) /
      100;
    return {
      unitPriceSnapshot,
      unitCostSnapshot,
      totalSaleAmount,
      totalCostAmount,
      profitAmount,
    };
  }

  private async applyMovement(
    input: {
      variantId: number;
      workspaceId: number;
      type: InventoryMovementType;
      reason: InventoryMovementReason;
      quantity: number;
      purchasePrice: number | null;
      comment: string | null;
      orderId?: number | null;
      orderItemId?: number | null;
      createdByUserId?: number | null;
      markOrderItemDeducted?: number;
    },
    existingEm?: EntityManager,
  ): Promise<{ movement: InventoryMovement; variant: ProductVariant }> {
    if (input.quantity <= 0) {
      throw new BadRequestException("quantity must be greater than 0");
    }
    assertReasonAllowedForType(input.type, input.reason);

    const run = async (
      em: EntityManager,
    ): Promise<{ movement: InventoryMovement; variant: ProductVariant }> => {
      const variant = await em.findOne(ProductVariant, {
        where: { id: input.variantId },
        relations: { product: true },
        lock: { mode: "pessimistic_write" },
      });
      if (!variant?.product) {
        throw new NotFoundException("Variant not found");
      }
      if (variant.product.workspaceId !== input.workspaceId) {
        throw new NotFoundException("Variant not found");
      }

      const before: StockState = {
        quantity: variant.quantity ?? 0,
        stockCostTotal: Number(variant.stockCostTotal),
        averagePurchasePrice: variant.averagePurchasePrice,
      };

      let after: StockState;
      let quantityDelta: number;
      let movementPurchasePrice: number | null = input.purchasePrice;

      if (input.type === InventoryMovementType.increase) {
        movementPurchasePrice = resolveIncreasePurchasePrice(
          input.reason,
          input.purchasePrice,
          before.averagePurchasePrice,
        );
        after = computeIncreaseStock(
          before,
          input.quantity,
          movementPurchasePrice,
        );
        quantityDelta = input.quantity;
      } else if (input.type === InventoryMovementType.decrease) {
        after = computeDecreaseStock(before, input.quantity);
        quantityDelta = -input.quantity;
        movementPurchasePrice = null;
      } else {
        after = computeSetStock(before, input.quantity, input.purchasePrice);
        quantityDelta = after.quantity - before.quantity;
        if (quantityDelta > 0) {
          movementPurchasePrice =
            input.purchasePrice ?? before.averagePurchasePrice;
        } else {
          movementPurchasePrice = input.purchasePrice ?? null;
        }
      }

      variant.quantity = after.quantity;
      variant.stockCostTotal = after.stockCostTotal;
      variant.averagePurchasePrice = after.averagePurchasePrice;
      await em.save(ProductVariant, variant);

      const movement = em.create(InventoryMovement, {
        workspaceId: input.workspaceId,
        productId: variant.productId,
        variantId: variant.id,
        type: input.type,
        reason: input.reason,
        quantityDelta,
        quantityBefore: before.quantity,
        quantityAfter: after.quantity,
        purchasePrice: movementPurchasePrice,
        stockCostBefore: before.stockCostTotal,
        stockCostAfter: after.stockCostTotal,
        averagePurchasePriceBefore: before.averagePurchasePrice,
        averagePurchasePriceAfter: after.averagePurchasePrice,
        comment: input.comment,
        orderId: input.orderId ?? null,
        orderItemId: input.orderItemId ?? null,
        createdByUserId: input.createdByUserId ?? null,
      });
      const savedMovement = await em.save(InventoryMovement, movement);

      if (input.markOrderItemDeducted != null) {
        await em.update(OrderItem, input.markOrderItemDeducted, {
          stockDeductedAt: new Date(),
        });
      }

      return { movement: savedMovement, variant };
    };

    if (existingEm) {
      return run(existingEm);
    }
    return this.dataSource.transaction(run);
  }

  private async requireInventoryView(
    userId: number,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<void> {
    const resolved = await this.permissions.getResolvedForUser(
      userId,
      appRole,
      workspaceIdParam,
    );
    if (!resolved.products.inventoryView) {
      throw new ForbiddenException("Missing products.inventory.view permission");
    }
  }

  private async requireInventoryManage(
    userId: number,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<void> {
    const resolved = await this.permissions.getResolvedForUser(
      userId,
      appRole,
      workspaceIdParam,
    );
    if (!resolved.products.inventoryManage) {
      throw new ForbiddenException(
        "Missing products.inventory.manage permission",
      );
    }
  }

  private toMovementDto(row: InventoryMovement): InventoryMovementItemDto {
    const user = row.createdByUser;
    const name =
      user == null
        ? null
        : [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
          user.email ||
          `User #${user.id}`;

    return {
      id: row.id,
      type: row.type,
      reason: row.reason,
      quantityDelta: row.quantityDelta,
      quantityBefore: row.quantityBefore,
      quantityAfter: row.quantityAfter,
      purchasePrice: row.purchasePrice,
      stockCostBefore: Number(row.stockCostBefore),
      stockCostAfter: Number(row.stockCostAfter),
      averagePurchasePriceBefore: row.averagePurchasePriceBefore,
      averagePurchasePriceAfter: row.averagePurchasePriceAfter,
      comment: row.comment,
      createdByUser:
        user == null
          ? null
          : {
              id: user.id,
              name: name ?? `User #${user.id}`,
            },
      createdAt: row.createdAt,
    };
  }

  private toVariantStateDto(variant: ProductVariant): InventoryVariantStateDto {
    const quantities = toVariantInventoryQuantities(variant);
    return {
      id: variant.id,
      quantity: quantities.quantity,
      reservedQuantity: quantities.reservedQuantity,
      availableQuantity: quantities.availableQuantity,
      stockQty: quantities.quantity,
      stockCostTotal: Number(variant.stockCostTotal),
      averagePurchasePrice: variant.averagePurchasePrice,
    };
  }
}
