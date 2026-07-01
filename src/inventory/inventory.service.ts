import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, In, Repository } from "typeorm";
import {
  InventoryMode,
  Order,
  OrderItem,
  OrderStatusCategory,
  Product,
  ProductVariant,
  StockMovement,
  StockMovementType,
  VariantStock,
  Workspace,
} from "../database/entities";
import { VariantCustomFieldsService } from "../variant-custom-fields/variant-custom-fields.service";
import { buildVariantTitleFromFields } from "../variant-custom-fields/variant-custom-fields.util";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { WorkspacePermissionsService } from "../workspace-access/workspace-permissions.service";
import type { CreateCorrectionDto } from "./dto/create-correction.dto";
import type { CreateInitialStockDto } from "./dto/create-initial-stock.dto";
import type { CreateInventoryCountDto } from "./dto/create-inventory-count.dto";
import type { CreatePurchaseDto } from "./dto/create-purchase.dto";
import type { CreateReturnDto } from "./dto/create-return.dto";
import type { SetSimpleQuantityDto } from "./dto/set-simple-quantity.dto";
import type {
  ProductStockListResponseDto,
  StockMovementItemDto,
  StockMovementListResponseDto,
  StockOperationResponseDto,
  VariantStockDto,
} from "./dto/stock-response.dto";
import {
  applyAdvancedQuantityDelta,
  applyAdvancedSale,
  applyInitialStock,
  applyPurchase,
  applyReturn,
  applySimpleQuantitySet,
  applySimpleSale,
  assertAdvancedMode,
  assertSimpleMode,
  assertStockInitialized,
  type StockSnapshot,
} from "./stock.logic";

type StockContext = {
  workspaceId: number;
  mode: InventoryMode;
  userId: number;
};

@Injectable()
export class InventoryService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(StockMovement)
    private readonly movementRepo: Repository<StockMovement>,
    @InjectRepository(VariantStock)
    private readonly stockRepo: Repository<VariantStock>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly permissions: WorkspacePermissionsService,
    private readonly variantCustomFields: VariantCustomFieldsService,
  ) {}

  async setSimpleQuantity(
    userId: number,
    dto: SetSimpleQuantityDto,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<StockOperationResponseDto> {
    const ctx = await this.requireManageContext(userId, appRole, workspaceIdParam);
    assertSimpleMode(ctx.mode);
    return this.runStockOperation(ctx, dto.variantId, async (stock) => {
      const result = applySimpleQuantitySet(this.toSnapshot(stock), dto.quantity);
      return {
        type: StockMovementType.simpleAdjustment,
        reason: null,
        quantityChange: result.quantityChange,
        purchasePrice: null,
        totalCostChange: null,
        comment: dto.comment ?? null,
        after: result.after,
      };
    });
  }

  async createInitialStock(
    userId: number,
    dto: CreateInitialStockDto,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<StockOperationResponseDto> {
    const ctx = await this.requireManageContext(userId, appRole, workspaceIdParam);
    assertAdvancedMode(ctx.mode);
    return this.runStockOperation(ctx, dto.variantId, async (stock) => {
      const result = applyInitialStock(
        this.toSnapshot(stock),
        dto.quantity,
        dto.purchasePrice,
      );
      return {
        type: StockMovementType.initialStock,
        reason: null,
        quantityChange: result.quantityChange,
        purchasePrice: dto.purchasePrice,
        totalCostChange: result.totalCostChange,
        comment: dto.comment ?? null,
        after: result.after,
      };
    });
  }

  async createPurchase(
    userId: number,
    dto: CreatePurchaseDto,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<StockOperationResponseDto> {
    const ctx = await this.requireManageContext(userId, appRole, workspaceIdParam);
    assertAdvancedMode(ctx.mode);
    return this.runStockOperation(ctx, dto.variantId, async (stock) => {
      const result = applyPurchase(
        this.toSnapshot(stock),
        dto.quantity,
        dto.purchasePrice,
      );
      return {
        type: StockMovementType.purchase,
        reason: null,
        quantityChange: result.quantityChange,
        purchasePrice: dto.purchasePrice,
        totalCostChange: result.totalCostChange,
        comment: dto.comment ?? null,
        after: result.after,
      };
    });
  }

  async createCorrection(
    userId: number,
    dto: CreateCorrectionDto,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<StockOperationResponseDto> {
    if (dto.quantityChange === 0) {
      throw new BadRequestException("quantityChange must not be 0");
    }
    const reason = dto.reason?.trim() || null;
    if (dto.quantityChange < 0 && !reason) {
      throw new BadRequestException(
        "reason is required when quantityChange is negative (write-off)",
      );
    }
    const ctx = await this.requireManageContext(userId, appRole, workspaceIdParam);
    assertAdvancedMode(ctx.mode);
    return this.runStockOperation(ctx, dto.variantId, async (stock) => {
      const before = this.toSnapshot(stock);
      assertStockInitialized(before);
      const result = applyAdvancedQuantityDelta(
        before,
        dto.quantityChange,
        true,
      );
      return {
        type: StockMovementType.correction,
        reason,
        quantityChange: dto.quantityChange,
        purchasePrice: null,
        totalCostChange: result.totalCostChange,
        comment: dto.comment ?? null,
        after: result.after,
      };
    });
  }

  async createInventory(
    userId: number,
    dto: CreateInventoryCountDto,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<StockOperationResponseDto> {
    const ctx = await this.requireManageContext(userId, appRole, workspaceIdParam);
    assertAdvancedMode(ctx.mode);
    return this.runStockOperation(ctx, dto.variantId, async (stock) => {
      const before = this.toSnapshot(stock);
      assertStockInitialized(before);
      const quantityChange = dto.quantity - before.quantity;
      if (quantityChange === 0) {
        throw new BadRequestException("Counted quantity matches current stock");
      }
      const result = applyAdvancedQuantityDelta(
        before,
        quantityChange,
        true,
      );
      return {
        type: StockMovementType.inventory,
        reason: null,
        quantityChange,
        purchasePrice: null,
        totalCostChange: result.totalCostChange,
        comment: dto.comment ?? null,
        after: result.after,
      };
    });
  }

  async createReturn(
    userId: number,
    dto: CreateReturnDto,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<StockOperationResponseDto> {
    const ctx = await this.requireManageContext(userId, appRole, workspaceIdParam);
    assertAdvancedMode(ctx.mode);
    return this.runStockOperation(ctx, dto.variantId, async (stock) => {
      const before = this.toSnapshot(stock);
      assertStockInitialized(before);
      const result = applyReturn(before, dto.quantity);
      return {
        type: StockMovementType.return,
        reason: null,
        quantityChange: dto.quantity,
        purchasePrice: before.avgPurchasePrice,
        totalCostChange: result.totalCostChange,
        comment: dto.comment ?? null,
        after: result.after,
      };
    });
  }

  async getVariantStock(
    userId: number,
    variantId: number,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<VariantStockDto> {
    const ctx = await this.requireViewContext(userId, appRole, workspaceIdParam);
    const stock = await this.requireDefaultVariantStock(
      ctx.workspaceId,
      variantId,
    );
    return this.toStockDto(stock, ctx.mode);
  }

  async listVariantMovements(
    userId: number,
    variantId: number,
    limit: number,
    offset: number,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<StockMovementListResponseDto> {
    const ctx = await this.requireViewContext(userId, appRole, workspaceIdParam);
    await this.assertVariantInWorkspace(ctx.workspaceId, variantId);

    const [rows, total] = await this.movementRepo.findAndCount({
      where: { variantId, workspaceId: ctx.workspaceId },
      relations: { user: true },
      order: { createdAt: "DESC", id: "DESC" },
      take: limit,
      skip: offset,
    });

    return {
      items: rows.map((row) => this.toMovementDto(row, row.user)),
      total,
    };
  }

  async getProductStock(
    userId: number,
    productId: number,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<ProductStockListResponseDto> {
    const ctx = await this.requireViewContext(userId, appRole, workspaceIdParam);
    const product = await this.productRepo.findOne({
      where: { id: productId, workspaceId: ctx.workspaceId },
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
      await this.variantCustomFields.listDefinitionsForWorkspace(ctx.workspaceId);
    const stocks =
      variants.length === 0
        ? []
        : await this.stockRepo.find({
            where: {
              workspaceId: ctx.workspaceId,
              variantId: In(variants.map((v) => v.id)),
            },
          });
    const stockByVariantId = new Map(stocks.map((s) => [s.variantId, s]));

    return {
      productId: product.id,
      variants: variants.map((variant) => {
        const stock =
          stockByVariantId.get(variant.id) ??
          this.emptyStockRow(ctx.workspaceId, variant.id);
        const dto = this.toStockDto(stock, ctx.mode);
        return {
          ...dto,
          sku: variant.sku,
          name: buildVariantTitleFromFields(fieldDefs, variant),
        };
      }),
    };
  }

  async getStockMapForVariantIds(
    workspaceId: number,
    variantIds: number[],
  ): Promise<Map<number, VariantStockDto>> {
    if (variantIds.length === 0) {
      return new Map();
    }
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });
    const mode = workspace?.inventoryMode ?? InventoryMode.simple;
    const rows = await this.stockRepo.find({
      where: {
        workspaceId,
        variantId: In(variantIds),
      },
    });
    const byVariantId = new Map(rows.map((r) => [r.variantId, r]));
    const result = new Map<number, VariantStockDto>();
    for (const variantId of variantIds) {
      const row =
        byVariantId.get(variantId) ??
        this.emptyStockRow(workspaceId, variantId);
      result.set(variantId, this.toStockDto(row, mode));
    }
    return result;
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

    switch (statusCategory) {
      case OrderStatusCategory.shipped:
        await this.shipStockForOrder(order, actorUserId);
        break;
      case OrderStatusCategory.canceled:
        await this.restoreStockForOrder(order, actorUserId);
        break;
      default:
        break;
    }
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
    const totalSaleAmount = this.roundMoney(unitPrice * quantity);
    const totalCostAmount =
      unitCost == null ? null : this.roundMoney(unitCost * quantity);
    const profitAmount =
      totalCostAmount == null
        ? null
        : this.roundMoney(totalSaleAmount - totalCostAmount);
    return {
      unitPriceSnapshot: unitPrice,
      unitCostSnapshot: unitCost,
      totalSaleAmount,
      totalCostAmount,
      profitAmount,
    };
  }

  async assertVariantSellable(
    workspaceId: number,
    variantId: number,
    quantity: number,
  ): Promise<void> {
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });
    const mode = workspace?.inventoryMode ?? InventoryMode.simple;
    const stock = await this.requireDefaultVariantStock(workspaceId, variantId);
    const snapshot = this.toSnapshot(stock);
    if (mode === InventoryMode.advanced && !snapshot.stockInitialized) {
      throw new BadRequestException(
        "Variant stock requires initialization before sale",
      );
    }
    if (snapshot.quantity < quantity) {
      throw new BadRequestException(
        `Insufficient stock for variant ${variantId}`,
      );
    }
  }

  private async shipStockForOrder(
    order: Order,
    actorUserId: number | null,
  ): Promise<void> {
    for (const item of order.items ?? []) {
      await this.dataSource.transaction(async (em) => {
        await this.shipOrderItem(em, order, item.id, actorUserId);
      });
    }
  }

  private async restoreStockForOrder(
    order: Order,
    actorUserId: number | null,
  ): Promise<void> {
    for (const item of order.items ?? []) {
      await this.dataSource.transaction(async (em) => {
        await this.restoreOrderItem(em, order, item.id, actorUserId);
      });
    }
  }

  private async shipOrderItem(
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

    const workspace = await em.findOne(Workspace, {
      where: { id: order.workspaceId },
    });
    const mode = workspace?.inventoryMode ?? InventoryMode.simple;
    const stock = await this.lockVariantStock(
      em,
      order.workspaceId,
      lockedItem.variantId,
    );
    const before = this.toSnapshot(stock);

    if (mode === InventoryMode.advanced) {
      assertStockInitialized(before);
      const sale = applyAdvancedSale(before, lockedItem.quantity);
      await this.persistStock(em, stock, sale.after);
      await em.save(
        em.create(StockMovement, {
          workspaceId: order.workspaceId,
          variantId: lockedItem.variantId,
          type: StockMovementType.orderSale,
          quantityChange: sale.quantityChange,
          purchasePrice: null,
          totalCostChange: sale.totalCostChange,
          reason: null,
          comment: null,
          orderId: order.id,
          orderItemId: lockedItem.id,
          userId: actorUserId,
        }),
      );
    } else {
      const sale = applySimpleSale(before, lockedItem.quantity);
      await this.persistStock(em, stock, sale.after);
      await em.save(
        em.create(StockMovement, {
          workspaceId: order.workspaceId,
          variantId: lockedItem.variantId,
          type: StockMovementType.simpleOrderSale,
          quantityChange: sale.quantityChange,
          purchasePrice: null,
          totalCostChange: null,
          reason: null,
          comment: null,
          orderId: order.id,
          orderItemId: lockedItem.id,
          userId: actorUserId,
        }),
      );
    }

    lockedItem.stockDeductedAt = new Date();
    await em.save(OrderItem, lockedItem);
  }

  private async restoreOrderItem(
    em: EntityManager,
    order: Order,
    orderItemId: number,
    actorUserId: number | null,
  ): Promise<void> {
    const lockedItem = await em.findOne(OrderItem, {
      where: { id: orderItemId },
      lock: { mode: "pessimistic_write" },
    });
    if (!lockedItem || lockedItem.stockDeductedAt == null) {
      return;
    }

    const workspace = await em.findOne(Workspace, {
      where: { id: order.workspaceId },
    });
    const mode = workspace?.inventoryMode ?? InventoryMode.simple;
    const stock = await this.lockVariantStock(
      em,
      order.workspaceId,
      lockedItem.variantId,
    );
    const before = this.toSnapshot(stock);

    if (mode === InventoryMode.advanced) {
      const restored = applyReturn(before, lockedItem.quantity);
      await this.persistStock(em, stock, restored.after);
      await em.save(
        em.create(StockMovement, {
          workspaceId: order.workspaceId,
          variantId: lockedItem.variantId,
          type: StockMovementType.orderCancel,
          quantityChange: lockedItem.quantity,
          purchasePrice: before.avgPurchasePrice,
          totalCostChange: restored.totalCostChange,
          reason: null,
          comment: null,
          orderId: order.id,
          orderItemId: lockedItem.id,
          userId: actorUserId,
        }),
      );
    } else {
      const after = {
        quantity: before.quantity + lockedItem.quantity,
        avgPurchasePrice: null,
        totalCost: null,
        stockInitialized: false,
      };
      await this.persistStock(em, stock, after);
      await em.save(
        em.create(StockMovement, {
          workspaceId: order.workspaceId,
          variantId: lockedItem.variantId,
          type: StockMovementType.simpleOrderCancel,
          quantityChange: lockedItem.quantity,
          purchasePrice: null,
          totalCostChange: null,
          reason: null,
          comment: null,
          orderId: order.id,
          orderItemId: lockedItem.id,
          userId: actorUserId,
        }),
      );
    }

    lockedItem.stockDeductedAt = null;
    await em.save(OrderItem, lockedItem);
  }

  private async runStockOperation(
    ctx: StockContext,
    variantId: number,
    build: (stock: VariantStock) => Promise<{
      type: StockMovementType;
      reason: string | null;
      quantityChange: number;
      purchasePrice: number | null;
      totalCostChange: number | null;
      comment: string | null;
      after: StockSnapshot;
      orderId?: number | null;
      orderItemId?: number | null;
    }>,
  ): Promise<StockOperationResponseDto> {
    return this.dataSource.transaction(async (em) => {
      const stock = await this.lockVariantStock(
        em,
        ctx.workspaceId,
        variantId,
      );
      const op = await build(stock);
      await this.persistStock(em, stock, op.after);
      const movement = await em.save(
        em.create(StockMovement, {
          workspaceId: ctx.workspaceId,
          variantId,
          type: op.type,
          quantityChange: op.quantityChange,
          purchasePrice: op.purchasePrice,
          totalCostChange: op.totalCostChange,
          reason: op.reason,
          comment: op.comment,
          orderId: op.orderId ?? null,
          orderItemId: op.orderItemId ?? null,
          userId: ctx.userId,
        }),
      );
      return {
        movement: this.toMovementDto(movement, null),
        stock: this.toStockDto(stock, ctx.mode),
      };
    });
  }

  private async requireManageContext(
    userId: number,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<StockContext> {
    await this.requireInventoryManage(userId, appRole, workspaceIdParam);
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      userId,
      appRole,
      workspaceIdParam,
    );
    return {
      workspaceId: workspace.id,
      mode: workspace.inventoryMode ?? InventoryMode.simple,
      userId,
    };
  }

  private async requireViewContext(
    userId: number,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<{ workspaceId: number; mode: InventoryMode }> {
    await this.requireInventoryView(userId, appRole, workspaceIdParam);
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      userId,
      appRole,
      workspaceIdParam,
    );
    return {
      workspaceId: workspace.id,
      mode: workspace.inventoryMode ?? InventoryMode.simple,
    };
  }

  private async ensureVariantStock(
    em: EntityManager,
    workspaceId: number,
    variantId: number,
  ): Promise<VariantStock> {
    let stock = await em.findOne(VariantStock, {
      where: { workspaceId, variantId },
      lock: { mode: "pessimistic_write" },
    });
    if (!stock) {
      stock = await em.save(
        em.create(VariantStock, {
          workspaceId,
          variantId,
          quantity: 0,
          avgPurchasePrice: null,
          totalCost: null,
          stockInitialized: false,
        }),
      );
    }
    return stock;
  }

  private async lockVariantStock(
    em: EntityManager,
    workspaceId: number,
    variantId: number,
  ): Promise<VariantStock> {
    await this.assertVariantInWorkspace(workspaceId, variantId, em);
    return this.ensureVariantStock(em, workspaceId, variantId);
  }

  private async requireDefaultVariantStock(
    workspaceId: number,
    variantId: number,
  ): Promise<VariantStock> {
    await this.assertVariantInWorkspace(workspaceId, variantId);
    let stock = await this.stockRepo.findOne({
      where: {
        workspaceId,
        variantId,
      },
    });
    if (!stock) {
      stock = await this.stockRepo.save(
        this.stockRepo.create({
          workspaceId,
          variantId,
          quantity: 0,
          avgPurchasePrice: null,
          totalCost: null,
          stockInitialized: false,
        }),
      );
    }
    return stock;
  }

  private async assertVariantInWorkspace(
    workspaceId: number,
    variantId: number,
    em?: EntityManager,
  ): Promise<void> {
    const variantRepo = em
      ? em.getRepository(ProductVariant)
      : this.variantRepo;
    const variant = await variantRepo.findOne({
      where: { id: variantId },
      relations: { product: true },
    });
    if (!variant?.product || variant.product.workspaceId !== workspaceId) {
      throw new NotFoundException("Variant not found");
    }
  }

  private persistStock(
    em: EntityManager,
    stock: VariantStock,
    after: StockSnapshot,
  ): Promise<VariantStock> {
    stock.quantity = after.quantity;
    stock.avgPurchasePrice = after.avgPurchasePrice;
    stock.totalCost = after.totalCost;
    stock.stockInitialized = after.stockInitialized;
    return em.save(VariantStock, stock);
  }

  private toSnapshot(stock: VariantStock): StockSnapshot {
    return {
      quantity: stock.quantity,
      avgPurchasePrice: stock.avgPurchasePrice,
      totalCost: stock.totalCost,
      stockInitialized: stock.stockInitialized,
    };
  }

  private emptyStockRow(
    workspaceId: number,
    variantId: number,
  ): VariantStock {
    return this.stockRepo.create({
      workspaceId,
      variantId,
      quantity: 0,
      avgPurchasePrice: null,
      totalCost: null,
      stockInitialized: false,
    });
  }

  private toStockDto(stock: VariantStock, mode: InventoryMode): VariantStockDto {
    return {
      variantId: stock.variantId,
      quantity: stock.quantity,
      avgPurchasePrice: stock.avgPurchasePrice,
      totalCost: stock.totalCost,
      stockInitialized: stock.stockInitialized,
      requiresInitialization:
        mode === InventoryMode.advanced && !stock.stockInitialized,
    };
  }

  private toMovementDto(
    row: StockMovement,
    user: { id: number; name?: string | null } | null | undefined,
  ): StockMovementItemDto {
    return {
      id: row.id,
      type: row.type,
      reason: row.reason,
      quantityChange: row.quantityChange,
      purchasePrice: row.purchasePrice,
      totalCostChange: row.totalCostChange,
      comment: row.comment,
      orderId: row.orderId,
      orderItemId: row.orderItemId,
      user:
        user == null
          ? null
          : {
              id: user.id,
              name: user.name?.trim() || `User #${user.id}`,
            },
      createdAt: row.createdAt,
    };
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

  private roundMoney(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
}
