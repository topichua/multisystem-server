import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, In, IsNull, Not, Repository } from "typeorm";
import {
  InventoryMode,
  Order,
  OrderItem,
  OrderStatusCategory,
  Product,
  ProductVariant,
  StockMovement,
  StockMovementType,
  StockSupply,
  StockSupplyItem,
  VariantStock,
  Workspace,
} from "../database/entities";
import { readPostgresQueryRows } from "../database/postgres-query-rows.util";
import { VariantCustomFieldsService } from "../variant-custom-fields/variant-custom-fields.service";
import { buildVariantTitleFromFields } from "../variant-custom-fields/variant-custom-fields.util";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { WorkspacePermissionsService } from "../workspace-access/workspace-permissions.service";
import type { CreateCorrectionDto } from "./dto/create-correction.dto";
import type { CreateInitialStockDto } from "./dto/create-initial-stock.dto";
import type { CreateInventoryCountDto } from "./dto/create-inventory-count.dto";
import type { CreatePurchaseDto } from "./dto/create-purchase.dto";
import type { CreateReturnDto } from "./dto/create-return.dto";
import type {
  CreateStockSupplyDto,
  CreateStockSupplyItemDto,
} from "./dto/create-stock-supply.dto";
import type { SetSimpleQuantityDto } from "./dto/set-simple-quantity.dto";
import type { UpdateStockSupplyDto } from "./dto/update-stock-supply.dto";
import type { ListStockSuppliesQueryDto } from "./dto/list-stock-supplies-query.dto";
import {
  ListStockSuppliesByFilter as SuppliesByFilter,
  ListStockSuppliesStatusFilter,
} from "./dto/list-stock-supplies-query.dto";
import type {
  ApplyStockSupplyResponseDto,
  CreateStockSupplyResponseDto,
  StockSupplyLineResultDto,
  StockSupplyListResponseDto,
  StockSupplyResponseDto,
} from "./dto/stock-supply-response.dto";
import type { ListStockHistoryQueryDto } from "./dto/list-stock-history-query.dto";
import type {
  StockHistoryListResponseDto,
  StockHistoryMovementEntryDto,
  StockHistorySupplyEntryDto,
  StockHistoryUserDto,
} from "./dto/stock-history-response.dto";
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
  applyRelease,
  applyReserve,
  applyReturn,
  applySimpleQuantitySet,
  applySimpleSale,
  applySupply,
  assertAdvancedMode,
  assertSimpleMode,
  assertStockInitialized,
  availableQuantity,
  type StockSnapshot,
} from "./stock.logic";

type StockContext = {
  workspaceId: number;
  mode: InventoryMode;
  userId: number;
};

type StockHistoryEntryRef = {
  kind: "supply" | "movement";
  entry_id: number;
  created_at: Date;
};

type StockHistoryFilterSql = {
  supplyWhere: string;
  movementWhere: string;
  params: unknown[];
  includeSupplies: boolean;
  includeMovements: boolean;
};

type VariantDisplayInfo = {
  productId: number;
  productName: string;
  variantName: string | null;
  sku: string | null;
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
    @InjectRepository(StockSupply)
    private readonly stockSupplyRepo: Repository<StockSupply>,
    @InjectRepository(StockSupplyItem)
    private readonly stockSupplyItemRepo: Repository<StockSupplyItem>,
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
    const ctx = await this.requireManageContext(
      userId,
      appRole,
      workspaceIdParam,
    );
    assertSimpleMode(ctx.mode);
    return this.runStockOperation(ctx, dto.variantId, async (stock) => {
      const result = applySimpleQuantitySet(
        this.toSnapshot(stock),
        dto.quantity,
      );
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
    const ctx = await this.requireManageContext(
      userId,
      appRole,
      workspaceIdParam,
    );
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
    const ctx = await this.requireManageContext(
      userId,
      appRole,
      workspaceIdParam,
    );
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

  async createStockSupply(
    userId: number,
    dto: CreateStockSupplyDto,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<CreateStockSupplyResponseDto> {
    const ctx = await this.requireManageContext(
      userId,
      appRole,
      workspaceIdParam,
    );
    assertAdvancedMode(ctx.mode);

    return this.dataSource.transaction(async (em) => {
      const now = new Date();
      const immediatelyApply = dto.immediatelyApply === true;
      const supply = await em.save(
        em.create(StockSupply, {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          name: dto.name.trim(),
          comment: dto.comment?.trim() || null,
          status: immediatelyApply ? "applied" : "pending",
          appliedAt: immediatelyApply ? now : null,
        }),
      );

      await this.replaceSupplyItems(em, ctx, supply.id, dto.items);

      const withUser = await em.findOne(StockSupply, {
        where: { id: supply.id },
        relations: { user: true },
      });

      if (!immediatelyApply) {
        const items = await em.find(StockSupplyItem, {
          where: { supplyId: supply.id },
          order: { id: "ASC" },
        });
        return {
          supply: this.toSupplyDto(supply, items, withUser?.user ?? null),
          lines: [],
        };
      }

      const lines = await this.applySupplyItemsInTx(em, ctx, supply);
      const items = await em.find(StockSupplyItem, {
        where: { supplyId: supply.id },
        order: { id: "ASC" },
      });
      return {
        supply: this.toSupplyDto(supply, items, withUser?.user ?? null),
        lines,
      };
    });
  }

  async listStockSupplies(
    userId: number,
    query: ListStockSuppliesQueryDto,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<StockSupplyListResponseDto> {
    const ctx = await this.requireViewContext(
      userId,
      appRole,
      workspaceIdParam,
    );
    assertAdvancedMode(ctx.mode);

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const whereQb = this.stockSupplyRepo
      .createQueryBuilder("ss")
      .where("ss.workspace_id = :workspaceId", {
        workspaceId: ctx.workspaceId,
      });

    const statusFilter = this.resolveSupplyStatusFilter(query);
    if (statusFilter === "applied") {
      whereQb.andWhere("ss.status = :status", { status: "applied" });
    } else if (statusFilter === "pending") {
      whereQb.andWhere("ss.status = :status", { status: "pending" });
    }

    if (query.createdFrom) {
      whereQb.andWhere("ss.created_at >= :createdFrom", {
        createdFrom: this.parseHistoryDateBoundary(query.createdFrom, "start"),
      });
    }
    if (query.createdTo) {
      whereQb.andWhere("ss.created_at <= :createdTo", {
        createdTo: this.parseHistoryDateBoundary(query.createdTo, "end"),
      });
    }
    if (query.createdBy) {
      whereQb.andWhere("ss.user_id = :createdBy", {
        createdBy: query.createdBy,
      });
    }

    const totalSumExpr = `(
      SELECT COALESCE(SUM(si.quantity * si.buy_price), 0)
      FROM stock_supply_items si
      WHERE si.supply_id = ss.id
    )`;
    if (query.totalSumFrom != null) {
      whereQb.andWhere(`${totalSumExpr} >= :totalSumFrom`, {
        totalSumFrom: query.totalSumFrom,
      });
    }
    if (query.totalSumTo != null) {
      whereQb.andWhere(`${totalSumExpr} <= :totalSumTo`, {
        totalSumTo: query.totalSumTo,
      });
    }

    const total = await whereQb.clone().getCount();
    const rows = await whereQb
      .leftJoinAndSelect("ss.user", "user")
      .leftJoinAndSelect("ss.items", "items")
      .orderBy("ss.createdAt", "DESC")
      .addOrderBy("ss.id", "DESC")
      .skip(offset)
      .take(limit)
      .getMany();

    return {
      items: rows.map((row) =>
        this.toSupplyDto(
          row,
          [...(row.items ?? [])].sort((a, b) => a.id - b.id),
          row.user,
        ),
      ),
      total,
      limit,
      offset,
    };
  }

  async getStockSupplyById(
    userId: number,
    supplyId: number,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<StockSupplyResponseDto> {
    const ctx = await this.requireViewContext(
      userId,
      appRole,
      workspaceIdParam,
    );
    assertAdvancedMode(ctx.mode);
    const supply = await this.requireSupplyInWorkspace(
      ctx.workspaceId,
      supplyId,
      true,
    );
    return this.toSupplyDto(
      supply,
      [...(supply.items ?? [])].sort((a, b) => a.id - b.id),
      supply.user,
    );
  }

  async applyStockSupply(
    userId: number,
    supplyId: number,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<ApplyStockSupplyResponseDto> {
    const ctx = await this.requireManageContext(
      userId,
      appRole,
      workspaceIdParam,
    );
    assertAdvancedMode(ctx.mode);

    return this.dataSource.transaction(async (em) => {
      const supply = await em.findOne(StockSupply, {
        where: { id: supplyId, workspaceId: ctx.workspaceId },
        lock: { mode: "pessimistic_write" },
      });
      if (!supply) {
        throw new NotFoundException("Supply not found");
      }
      if (supply.status === "applied") {
        throw new BadRequestException("Supply is already applied");
      }

      const lines = await this.applySupplyItemsInTx(em, ctx, supply);
      supply.status = "applied";
      supply.appliedAt = new Date();
      await em.save(supply);

      const items = await em.find(StockSupplyItem, {
        where: { supplyId: supply.id },
        order: { id: "ASC" },
      });
      const withUser = await em.findOne(StockSupply, {
        where: { id: supply.id },
        relations: { user: true },
      });

      return {
        supply: this.toSupplyDto(supply, items, withUser?.user ?? null),
        lines,
      };
    });
  }

  async updateStockSupply(
    userId: number,
    supplyId: number,
    dto: UpdateStockSupplyDto,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<StockSupplyResponseDto> {
    const ctx = await this.requireManageContext(
      userId,
      appRole,
      workspaceIdParam,
    );
    assertAdvancedMode(ctx.mode);

    if (dto.items === undefined && dto.comment === undefined && dto.name === undefined) {
      throw new BadRequestException(
        "At least one of name, items or comment must be provided",
      );
    }

    return this.dataSource.transaction(async (em) => {
      const supply = await em.findOne(StockSupply, {
        where: { id: supplyId, workspaceId: ctx.workspaceId },
        lock: { mode: "pessimistic_write" },
        relations: { user: true },
      });
      if (!supply) {
        throw new NotFoundException("Supply not found");
      }
      if (supply.status !== "pending") {
        throw new BadRequestException(
          "Only pending (not applied) supplies can be edited",
        );
      }

      let dirty = false;
      if (dto.name !== undefined) {
        supply.name = dto.name.trim();
        dirty = true;
      }
      if (dto.comment !== undefined) {
        supply.comment =
          dto.comment == null ? null : dto.comment.trim() || null;
        dirty = true;
      }
      if (dirty) {
        await em.save(supply);
      }

      if (dto.items !== undefined) {
        await this.replaceSupplyItems(em, ctx, supply.id, dto.items);
      }

      const items = await em.find(StockSupplyItem, {
        where: { supplyId: supply.id },
        order: { id: "ASC" },
      });
      return this.toSupplyDto(supply, items, supply.user);
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
    const ctx = await this.requireManageContext(
      userId,
      appRole,
      workspaceIdParam,
    );
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
    const ctx = await this.requireManageContext(
      userId,
      appRole,
      workspaceIdParam,
    );
    assertAdvancedMode(ctx.mode);
    return this.runStockOperation(ctx, dto.variantId, async (stock) => {
      const before = this.toSnapshot(stock);
      assertStockInitialized(before);
      const quantityChange = dto.quantity - before.quantity;
      if (quantityChange === 0) {
        throw new BadRequestException("Counted quantity matches current stock");
      }
      const result = applyAdvancedQuantityDelta(before, quantityChange, true);
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
    const ctx = await this.requireManageContext(
      userId,
      appRole,
      workspaceIdParam,
    );
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
    const ctx = await this.requireViewContext(
      userId,
      appRole,
      workspaceIdParam,
    );
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
    const ctx = await this.requireViewContext(
      userId,
      appRole,
      workspaceIdParam,
    );
    await this.assertVariantInWorkspace(ctx.workspaceId, variantId);

    const [rows, total] = await this.movementRepo.findAndCount({
      where: {
        variantId,
        workspaceId: ctx.workspaceId,
        ...(ctx.mode === InventoryMode.simple
          ? {
              type: Not(
                In([
                  StockMovementType.orderReserve,
                  StockMovementType.orderRelease,
                ]),
              ),
            }
          : {}),
      },
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

  async listStockHistory(
    userId: number,
    query: ListStockHistoryQueryDto,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<StockHistoryListResponseDto> {
    const ctx = await this.requireViewContext(
      userId,
      appRole,
      workspaceIdParam,
    );
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const filters = this.buildStockHistoryFilters(
      ctx.workspaceId,
      query,
      ctx.mode,
    );

    if (!filters.includeSupplies && !filters.includeMovements) {
      return { items: [], total: 0 };
    }

    const countSql = this.buildStockHistoryCountSql(filters);
    const listSql = this.buildStockHistoryListSql(filters);
    const listParams = [...filters.params, limit, offset];

    const [countRows, entryRows] = await Promise.all([
      this.dataSource.query(countSql, filters.params),
      this.dataSource.query(listSql, listParams),
    ]);

    const total = Number(
      readPostgresQueryRows<{ cnt: string }>(countRows)[0]?.cnt ?? 0,
    );
    const refs = readPostgresQueryRows<StockHistoryEntryRef>(entryRows);
    if (refs.length === 0) {
      return { items: [], total };
    }

    const supplyIds = refs
      .filter((row) => row.kind === "supply")
      .map((row) => row.entry_id);
    const movementIds = refs
      .filter((row) => row.kind === "movement")
      .map((row) => row.entry_id);

    const [supplies, movements] = await Promise.all([
      supplyIds.length === 0
        ? Promise.resolve([])
        : this.stockSupplyRepo.find({
            where: { id: In(supplyIds), workspaceId: ctx.workspaceId },
            relations: { user: true },
          }),
      movementIds.length === 0
        ? Promise.resolve([])
        : this.movementRepo.find({
            where: { id: In(movementIds), workspaceId: ctx.workspaceId },
            relations: { user: true },
          }),
    ]);

    const supplyMovements =
      supplyIds.length === 0
        ? []
        : await this.movementRepo.find({
            where: {
              workspaceId: ctx.workspaceId,
              supplyId: In(supplyIds),
            },
            order: { id: "ASC" },
          });

    const stockLevelMovementIds = [
      ...movementIds,
      ...supplyMovements.map((row) => row.id),
    ];
    const stockLevels =
      stockLevelMovementIds.length === 0
        ? new Map<number, { stockAfter: number }>()
        : await this.loadStockLevelsForMovementIds(
            ctx.workspaceId,
            stockLevelMovementIds,
          );

    const variantIds = [
      ...new Set([
        ...movements.map((row) => row.variantId),
        ...supplyMovements.map((row) => row.variantId),
      ]),
    ];
    const variantDisplay = await this.loadVariantDisplayMap(
      ctx.workspaceId,
      variantIds,
    );

    const supplyById = new Map(supplies.map((row) => [row.id, row]));
    const supplyMovementsBySupplyId = new Map<number, StockMovement[]>();
    for (const row of supplyMovements) {
      if (row.supplyId == null) continue;
      const bucket = supplyMovementsBySupplyId.get(row.supplyId) ?? [];
      bucket.push(row);
      supplyMovementsBySupplyId.set(row.supplyId, bucket);
    }
    const movementById = new Map(movements.map((row) => [row.id, row]));

    const items: Array<
      StockHistorySupplyEntryDto | StockHistoryMovementEntryDto
    > = [];
    for (const ref of refs) {
      if (ref.kind === "supply") {
        const supply = supplyById.get(ref.entry_id);
        if (!supply) continue;
        items.push(
          this.toStockHistorySupplyEntry(
            supply,
            supplyMovementsBySupplyId.get(ref.entry_id) ?? [],
            variantDisplay,
            stockLevels,
          ),
        );
        continue;
      }
      const movement = movementById.get(ref.entry_id);
      if (!movement) continue;
      items.push(
        this.toStockHistoryMovementEntry(
          movement,
          variantDisplay,
          stockLevels.get(ref.entry_id),
        ),
      );
    }

    return { items, total };
  }

  async getProductStock(
    userId: number,
    productId: number,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<ProductStockListResponseDto> {
    const ctx = await this.requireViewContext(
      userId,
      appRole,
      workspaceIdParam,
    );
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
      await this.variantCustomFields.listDefinitionsForWorkspace(
        ctx.workspaceId,
      );
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

  /**
   * Release advanced-mode reservations for order lines pointing at these variants.
   * Call before hard-deleting variants so reserved stock is restored.
   */
  async releaseActiveReservationsForVariants(
    workspaceId: number,
    variantIds: number[],
    actorUserId: number | null,
  ): Promise<void> {
    const unique = [...new Set(variantIds.filter((id) => id > 0))];
    if (unique.length === 0) {
      return;
    }
    const items = await this.orderItemRepo.find({
      where: {
        workspaceId,
        variantId: In(unique),
        stockReservedAt: Not(IsNull()),
        stockReleasedAt: IsNull(),
        stockDeductedAt: IsNull(),
      },
    });
    for (const item of items) {
      const order = await this.orderRepo.findOne({
        where: { id: item.orderId, workspaceId },
      });
      if (!order) {
        continue;
      }
      await this.dataSource.transaction(async (em) => {
        await this.releaseOrderItem(em, order, item.id, actorUserId);
      });
    }
  }

  async handleOrderInventoryForStatus(
    workspaceId: number,
    orderId: number,
    newStatusCategory: OrderStatusCategory,
    actorUserId: number | null,
    previousStatusCategory?: OrderStatusCategory | null,
  ): Promise<void> {
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });
    const mode = workspace?.inventoryMode ?? InventoryMode.simple;

    const order = await this.orderRepo.findOne({
      where: { workspaceId, id: orderId },
      relations: { items: true },
    });
    if (!order) {
      return;
    }

    if (mode === InventoryMode.advanced) {
      if (
        previousStatusCategory != null &&
        this.isReservationHoldingCategory(previousStatusCategory) &&
        !this.isReservationHoldingCategory(newStatusCategory) &&
        newStatusCategory !== OrderStatusCategory.completed &&
        newStatusCategory !== OrderStatusCategory.canceled
      ) {
        await this.releaseStockForOrder(order, actorUserId);
      }
    }

    switch (newStatusCategory) {
      case OrderStatusCategory.confirmed:
        if (mode === InventoryMode.advanced) {
          await this.reserveStockForOrder(order, actorUserId);
        }
        break;
      case OrderStatusCategory.completed:
        await this.deductStockForOrder(order, actorUserId);
        break;
      case OrderStatusCategory.canceled:
        if (mode === InventoryMode.advanced) {
          await this.releaseStockForOrder(order, actorUserId);
        }
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
    if (mode === InventoryMode.simple) {
      if (snapshot.quantity < quantity) {
        throw new BadRequestException(
          `Insufficient stock for variant ${variantId}`,
        );
      }
      return;
    }

    if (!snapshot.stockInitialized) {
      throw new BadRequestException(
        "Variant stock requires initialization before sale",
      );
    }
    if (snapshot.quantity < quantity) {
      throw new BadRequestException(
        `Insufficient stock for variant ${variantId}`,
      );
    }
    if (availableQuantity(snapshot) < quantity) {
      throw new BadRequestException(
        `Insufficient available stock for variant ${variantId}`,
      );
    }
  }

  private isReservationHoldingCategory(category: OrderStatusCategory): boolean {
    return (
      category === OrderStatusCategory.confirmed ||
      category === OrderStatusCategory.delivery
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

  private async deductStockForOrder(
    order: Order,
    actorUserId: number | null,
  ): Promise<void> {
    for (const item of order.items ?? []) {
      await this.dataSource.transaction(async (em) => {
        await this.deductOrderItem(em, order, item.id, actorUserId);
      });
    }
  }
  private async deductOrderItem(
    em: EntityManager,
    order: Order,
    orderItemId: number,
    actorUserId: number | null,
  ): Promise<void> {
    const lockedItem = await em.findOne(OrderItem, {
      where: { id: orderItemId },
      lock: { mode: "pessimistic_write" },
    });
    if (
      !lockedItem ||
      lockedItem.variantId == null ||
      lockedItem.stockDeductedAt != null
    ) {
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
    const wasReserved =
      lockedItem.stockReservedAt != null && lockedItem.stockReleasedAt == null;
    let before = this.toSnapshot(stock);

    if (wasReserved) {
      const released = applyRelease(before, lockedItem.quantity);
      before = released.after;
      await em.save(
        em.create(StockMovement, {
          workspaceId: order.workspaceId,
          variantId: lockedItem.variantId,
          type: StockMovementType.orderRelease,
          quantityChange: released.quantityChange,
          purchasePrice: null,
          totalCostChange: null,
          reason: null,
          comment: null,
          orderId: order.id,
          orderItemId: lockedItem.id,
          userId: actorUserId,
        }),
      );
    } else if (mode === InventoryMode.simple) {
      if (before.quantity < lockedItem.quantity) {
        throw new BadRequestException(
          `Insufficient stock for variant ${lockedItem.variantId}`,
        );
      }
    } else if (availableQuantity(before) < lockedItem.quantity) {
      throw new BadRequestException(
        `Insufficient available stock for variant ${lockedItem.variantId}`,
      );
    }

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
    if (wasReserved) {
      lockedItem.stockReleasedAt = new Date();
    }
    await em.save(OrderItem, lockedItem);
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
    if (
      !lockedItem ||
      lockedItem.variantId == null ||
      lockedItem.stockReservedAt != null ||
      lockedItem.stockDeductedAt != null
    ) {
      return;
    }

    const workspace = await em.findOne(Workspace, {
      where: { id: order.workspaceId },
    });
    const mode = workspace?.inventoryMode ?? InventoryMode.simple;
    if (mode !== InventoryMode.advanced) {
      return;
    }

    const stock = await this.lockVariantStock(
      em,
      order.workspaceId,
      lockedItem.variantId,
    );
    const before = this.toSnapshot(stock);
    if (!before.stockInitialized) {
      throw new BadRequestException(
        "Variant stock requires initialization before reservation",
      );
    }

    const reserved = applyReserve(before, lockedItem.quantity);
    await this.persistStock(em, stock, reserved.after);
    await em.save(
      em.create(StockMovement, {
        workspaceId: order.workspaceId,
        variantId: lockedItem.variantId,
        type: StockMovementType.orderReserve,
        quantityChange: reserved.quantityChange,
        purchasePrice: null,
        totalCostChange: null,
        reason: null,
        comment: null,
        orderId: order.id,
        orderItemId: lockedItem.id,
        userId: actorUserId,
      }),
    );

    lockedItem.stockReservedAt = new Date();
    lockedItem.stockReleasedAt = null;
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
    if (
      !lockedItem ||
      lockedItem.variantId == null ||
      lockedItem.stockReservedAt == null ||
      lockedItem.stockReleasedAt != null ||
      lockedItem.stockDeductedAt != null
    ) {
      return;
    }

    const stock = await this.lockVariantStock(
      em,
      order.workspaceId,
      lockedItem.variantId,
    );
    const before = this.toSnapshot(stock);
    const released = applyRelease(before, lockedItem.quantity);
    await this.persistStock(em, stock, released.after);
    await em.save(
      em.create(StockMovement, {
        workspaceId: order.workspaceId,
        variantId: lockedItem.variantId,
        type: StockMovementType.orderRelease,
        quantityChange: released.quantityChange,
        purchasePrice: null,
        totalCostChange: null,
        reason: null,
        comment: null,
        orderId: order.id,
        orderItemId: lockedItem.id,
        userId: actorUserId,
      }),
    );

    lockedItem.stockReleasedAt = new Date();
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
      const stock = await this.lockVariantStock(em, ctx.workspaceId, variantId);
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

  private resolveSupplyStatusFilter(
    query: ListStockSuppliesQueryDto,
  ): "all" | "applied" | "pending" {
    if (query.by === SuppliesByFilter.applied) return "applied";
    if (query.by === SuppliesByFilter.not_applied) return "pending";
    if (query.by === SuppliesByFilter.all) return "all";
    if (query.status === ListStockSuppliesStatusFilter.applied) return "applied";
    if (query.status === ListStockSuppliesStatusFilter.pending) return "pending";
    return "all";
  }

  private async requireSupplyInWorkspace(
    workspaceId: number,
    supplyId: number,
    withRelations: boolean,
  ): Promise<StockSupply> {
    const supply = await this.stockSupplyRepo.findOne({
      where: { id: supplyId, workspaceId },
      ...(withRelations
        ? { relations: { items: true, user: true } }
        : {}),
    });
    if (!supply) {
      throw new NotFoundException("Supply not found");
    }
    return supply;
  }

  private async replaceSupplyItems(
    em: EntityManager,
    ctx: StockContext,
    supplyId: number,
    items: CreateStockSupplyItemDto[],
  ): Promise<void> {
    await em.delete(StockSupplyItem, { supplyId });
    for (const item of items) {
      await this.assertSupplyItemVariant(em, ctx.workspaceId, item);
      await em.save(
        em.create(StockSupplyItem, {
          supplyId,
          productId: item.productId,
          variantId: item.productVariantId,
          quantity: item.quantity,
          buyPrice: item.buyPrice,
        }),
      );
    }
  }

  private async assertSupplyItemVariant(
    em: EntityManager,
    workspaceId: number,
    item: CreateStockSupplyItemDto,
  ): Promise<void> {
    const variant = await em.findOne(ProductVariant, {
      where: { id: item.productVariantId },
      relations: { product: true },
    });
    if (!variant?.product || variant.product.workspaceId !== workspaceId) {
      throw new NotFoundException(
        `Variant ${item.productVariantId} not found`,
      );
    }
    if (variant.productId !== item.productId) {
      throw new BadRequestException(
        `productVariantId ${item.productVariantId} does not belong to productId ${item.productId}`,
      );
    }
  }

  private async applySupplyItemsInTx(
    em: EntityManager,
    ctx: StockContext,
    supply: StockSupply,
  ): Promise<StockSupplyLineResultDto[]> {
    const items = await em.find(StockSupplyItem, {
      where: { supplyId: supply.id },
      order: { id: "ASC" },
    });
    if (items.length === 0) {
      throw new BadRequestException("Supply has no line items to apply");
    }

    const lines: StockSupplyLineResultDto[] = [];
    for (const item of items) {
      const stock = await this.lockVariantStock(
        em,
        ctx.workspaceId,
        item.variantId,
      );
      const result = applySupply(
        this.toSnapshot(stock),
        item.quantity,
        item.buyPrice,
      );
      await this.persistStock(em, stock, result.after);

      const movement = await em.save(
        em.create(StockMovement, {
          workspaceId: ctx.workspaceId,
          variantId: item.variantId,
          type: StockMovementType.supply,
          quantityChange: result.quantityChange,
          purchasePrice: item.buyPrice,
          totalCostChange: result.totalCostChange,
          reason: null,
          comment: supply.comment,
          orderId: null,
          orderItemId: null,
          supplyId: supply.id,
          userId: ctx.userId,
        }),
      );

      lines.push({
        item: {
          productId: item.productId,
          productVariantId: item.variantId,
          quantity: item.quantity,
          buyPrice: item.buyPrice,
        },
        movement: this.toMovementDto(movement, null),
        stock: this.toStockDto(stock, ctx.mode),
      });
    }
    return lines;
  }

  private toSupplyDto(
    supply: StockSupply,
    items: StockSupplyItem[],
    user:
      | {
          id: number;
          firstName?: string | null;
          lastName?: string | null;
          name?: string | null;
        }
      | null
      | undefined,
  ): StockSupplyResponseDto {
    let totalQuantity = 0;
    let totalSum = 0;
    const itemDtos = items.map((item) => {
      const quantity = Number(item.quantity);
      const buyPrice = Number(item.buyPrice);
      totalQuantity += quantity;
      totalSum += quantity * buyPrice;
      return {
        productId: item.productId,
        productVariantId: item.variantId,
        quantity,
        buyPrice,
      };
    });

    return {
      id: supply.id,
      name: supply.name,
      status: supply.status,
      comment: supply.comment,
      createdAt: supply.createdAt,
      appliedAt: supply.appliedAt,
      createdBy: this.toHistoryUser(user),
      positionsCount: items.length,
      totalQuantity,
      totalSum,
      items: itemDtos,
    };
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
    stock.reservedQuantity = after.reservedQuantity;
    stock.avgPurchasePrice = after.avgPurchasePrice;
    stock.totalCost = after.totalCost;
    stock.stockInitialized = after.stockInitialized;
    return em.save(VariantStock, stock);
  }

  private toSnapshot(stock: VariantStock): StockSnapshot {
    return {
      quantity: stock.quantity,
      reservedQuantity: stock.reservedQuantity,
      avgPurchasePrice: stock.avgPurchasePrice,
      totalCost: stock.totalCost,
      stockInitialized: stock.stockInitialized,
    };
  }

  private emptyStockRow(workspaceId: number, variantId: number): VariantStock {
    return this.stockRepo.create({
      workspaceId,
      variantId,
      quantity: 0,
      reservedQuantity: 0,
      avgPurchasePrice: null,
      totalCost: null,
      stockInitialized: false,
    });
  }

  private toStockDto(
    stock: VariantStock,
    mode: InventoryMode,
  ): VariantStockDto {
    const hideReservations = mode === InventoryMode.simple;
    return {
      variantId: stock.variantId,
      quantity: stock.quantity,
      reservedQuantity: hideReservations ? null : stock.reservedQuantity,
      availableQuantity: hideReservations
        ? null
        : stock.quantity - stock.reservedQuantity,
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
      supplyId: row.supplyId,
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

  private buildStockHistoryFilters(
    workspaceId: number,
    query: ListStockHistoryQueryDto,
    mode: InventoryMode,
  ): StockHistoryFilterSql {
    const params: unknown[] = [workspaceId];
    let idx = 2;
    const supplyParts = ["ss.workspace_id = $1", "ss.status = 'applied'"];
    const movementParts = ["sm.workspace_id = $1", "sm.supply_id IS NULL"];
    if (mode === InventoryMode.simple) {
      movementParts.push(
        "sm.type NOT IN ('order_reserve'::stock_movement_type_enum, 'order_release'::stock_movement_type_enum)",
      );
    }

    if (query.from) {
      const from = this.parseHistoryDateBoundary(query.from, "start");
      supplyParts.push(`ss.created_at >= $${idx}`);
      movementParts.push(`sm.created_at >= $${idx}`);
      params.push(from);
      idx++;
    }
    if (query.to) {
      const to = this.parseHistoryDateBoundary(query.to, "end");
      supplyParts.push(`ss.created_at <= $${idx}`);
      movementParts.push(`sm.created_at <= $${idx}`);
      params.push(to);
      idx++;
    }
    if (query.userId) {
      supplyParts.push(`ss.user_id = $${idx}`);
      movementParts.push(`sm.user_id = $${idx}`);
      params.push(query.userId);
      idx++;
    }

    const includeSupplies =
      !query.type || query.type === StockMovementType.supply;
    const includeMovements =
      !query.type || query.type !== StockMovementType.supply;

    if (query.type && query.type !== StockMovementType.supply) {
      movementParts.push(`sm.type = $${idx}::stock_movement_type_enum`);
      params.push(query.type);
      idx++;
    }

    const keyword = query.keyword?.trim();
    if (keyword) {
      const keywordIdx = idx;
      params.push(`%${this.escapePgIlikePattern(keyword)}%`);
      idx++;

      const productMatch = `(
        p_kw.name ILIKE $${keywordIdx} ESCAPE '\\'
        OR COALESCE(pv_kw.sku, '') ILIKE $${keywordIdx} ESCAPE '\\'
      )`;
      const managerMatch = `(
        u_kw.first_name ILIKE $${keywordIdx} ESCAPE '\\'
        OR COALESCE(u_kw.last_name, '') ILIKE $${keywordIdx} ESCAPE '\\'
        OR (u_kw.first_name || ' ' || COALESCE(u_kw.last_name, '')) ILIKE $${keywordIdx} ESCAPE '\\'
      )`;

      supplyParts.push(`(
        EXISTS (
          SELECT 1
          FROM stock_supply_items si_kw
          INNER JOIN product_variants pv_kw ON pv_kw.id = si_kw.variant_id
          INNER JOIN products p_kw ON p_kw.id = pv_kw.product_id
          WHERE si_kw.supply_id = ss.id
            AND ${productMatch}
        )
        OR EXISTS (
          SELECT 1
          FROM users u_kw
          WHERE u_kw.id = ss.user_id
            AND ${managerMatch}
        )
      )`);

      movementParts.push(`(
        EXISTS (
          SELECT 1
          FROM product_variants pv_kw
          INNER JOIN products p_kw ON p_kw.id = pv_kw.product_id
          WHERE pv_kw.id = sm.variant_id
            AND ${productMatch}
        )
        OR EXISTS (
          SELECT 1
          FROM users u_kw
          WHERE u_kw.id = sm.user_id
            AND ${managerMatch}
        )
      )`);
    }

    return {
      supplyWhere: supplyParts.join(" AND "),
      movementWhere: movementParts.join(" AND "),
      params,
      includeSupplies,
      includeMovements,
    };
  }

  private buildStockHistoryCountSql(filters: StockHistoryFilterSql): string {
    const branches: string[] = [];
    if (filters.includeSupplies) {
      branches.push(
        `SELECT ss.id FROM stock_supplies ss WHERE ${filters.supplyWhere}`,
      );
    }
    if (filters.includeMovements) {
      branches.push(
        `SELECT sm.id FROM stock_movements sm WHERE ${filters.movementWhere}`,
      );
    }
    return `SELECT COUNT(*)::text AS cnt FROM (${branches.join(" UNION ALL ")}) history`;
  }

  private buildStockHistoryListSql(filters: StockHistoryFilterSql): string {
    const branches: string[] = [];
    if (filters.includeSupplies) {
      branches.push(`
        SELECT
          'supply'::text AS kind,
          ss.id AS entry_id,
          ss.created_at AS created_at
        FROM stock_supplies ss
        WHERE ${filters.supplyWhere}
      `);
    }
    if (filters.includeMovements) {
      branches.push(`
        SELECT
          'movement'::text AS kind,
          sm.id AS entry_id,
          sm.created_at AS created_at
        FROM stock_movements sm
        WHERE ${filters.movementWhere}
      `);
    }
    const limitIdx = filters.params.length + 1;
    const offsetIdx = filters.params.length + 2;
    return `
      SELECT kind, entry_id, created_at
      FROM (${branches.join(" UNION ALL ")}) history
      ORDER BY created_at DESC, entry_id DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;
  }

  private parseHistoryDateBoundary(
    value: string,
    boundary: "start" | "end",
  ): Date {
    const trimmed = value.trim();
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      if (boundary === "start") {
        date.setUTCHours(0, 0, 0, 0);
      } else {
        date.setUTCHours(23, 59, 59, 999);
      }
    }
    return date;
  }

  private escapePgIlikePattern(value: string): string {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
  }

  private async loadStockLevelsForMovementIds(
    workspaceId: number,
    movementIds: number[],
  ): Promise<Map<number, { stockAfter: number }>> {
    const rows = readPostgresQueryRows<{
      id: string;
      stock_after: string;
    }>(
      await this.dataSource.query(
        `
          WITH stock_levels AS (
            SELECT
              sm.id,
              SUM(sm.quantity_change) OVER (
                PARTITION BY sm.variant_id
                ORDER BY sm.created_at ASC, sm.id ASC
              ) AS stock_after
            FROM stock_movements sm
            WHERE sm.workspace_id = $1
          )
          SELECT id, stock_after
          FROM stock_levels
          WHERE id = ANY($2::int[])
        `,
        [workspaceId, movementIds],
      ),
    );

    return new Map(
      rows.map((row) => [
        Number(row.id),
        { stockAfter: Number(row.stock_after) },
      ]),
    );
  }

  private async loadVariantDisplayMap(
    workspaceId: number,
    variantIds: number[],
  ): Promise<Map<number, VariantDisplayInfo>> {
    if (variantIds.length === 0) {
      return new Map();
    }

    const variants = await this.variantRepo.find({
      where: { id: In(variantIds) },
      relations: { product: true, customFieldValues: true },
      order: { id: "ASC" },
    });
    const fieldDefs =
      await this.variantCustomFields.listDefinitionsForWorkspace(workspaceId);

    const result = new Map<number, VariantDisplayInfo>();
    for (const variant of variants) {
      if (!variant.product) continue;
      result.set(variant.id, {
        productId: variant.productId,
        productName: variant.product.name,
        variantName: buildVariantTitleFromFields(fieldDefs, variant),
        sku: variant.sku,
      });
    }
    return result;
  }

  private toHistoryUser(
    user:
      | {
          id: number;
          firstName?: string | null;
          lastName?: string | null;
          name?: string | null;
        }
      | null
      | undefined,
  ): StockHistoryUserDto | null {
    if (!user) return null;
    const fromParts = [user.firstName?.trim(), user.lastName?.trim()]
      .filter(Boolean)
      .join(" ")
      .trim();
    const name = fromParts || user.name?.trim() || `User #${user.id}`;
    return { id: user.id, name };
  }

  private toStockHistorySupplyEntry(
    supply: StockSupply,
    movements: StockMovement[],
    variantDisplay: Map<number, VariantDisplayInfo>,
    stockLevels: Map<number, { stockAfter: number }>,
  ): StockHistorySupplyEntryDto {
    const items = movements.map((movement) => {
      const display = variantDisplay.get(movement.variantId);
      const stockAfter = stockLevels.get(movement.id)?.stockAfter ?? null;
      const stockBefore =
        stockAfter == null ? null : stockAfter - movement.quantityChange;
      return {
        movementId: movement.id,
        productId: display?.productId ?? 0,
        productName: display?.productName ?? "",
        variantId: movement.variantId,
        variantName: display?.variantName ?? null,
        sku: display?.sku ?? null,
        quantityChange: movement.quantityChange,
        purchasePrice: movement.purchasePrice,
        stockBefore,
        stockAfter,
      };
    });

    return {
      kind: "supply",
      id: supply.id,
      type: StockMovementType.supply,
      createdAt: supply.createdAt,
      name: supply.name,
      comment: supply.comment,
      user: this.toHistoryUser(supply.user),
      totalQuantityChange: movements.reduce(
        (sum, row) => sum + row.quantityChange,
        0,
      ),
      itemCount: movements.length,
      items,
    };
  }

  private toStockHistoryMovementEntry(
    movement: StockMovement,
    variantDisplay: Map<number, VariantDisplayInfo>,
    stockLevel?: { stockAfter: number },
  ): StockHistoryMovementEntryDto {
    const display = variantDisplay.get(movement.variantId);
    const stockAfter = stockLevel?.stockAfter ?? null;
    const stockBefore =
      stockAfter == null ? null : stockAfter - movement.quantityChange;

    return {
      kind: "movement",
      id: movement.id,
      type: movement.type,
      createdAt: movement.createdAt,
      reason: movement.reason,
      comment: movement.comment,
      user: this.toHistoryUser(movement.user),
      productId: display?.productId ?? 0,
      productName: display?.productName ?? "",
      variantId: movement.variantId,
      variantName: display?.variantName ?? null,
      sku: display?.sku ?? null,
      quantityChange: movement.quantityChange,
      purchasePrice: movement.purchasePrice,
      totalCostChange: movement.totalCostChange,
      stockBefore,
      stockAfter,
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
      throw new ForbiddenException(
        "Missing products.inventory.view permission",
      );
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
