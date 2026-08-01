import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { CreateCorrectionDto } from "./dto/create-correction.dto";
import { CreateInitialStockDto } from "./dto/create-initial-stock.dto";
import { CreateInventoryCountDto } from "./dto/create-inventory-count.dto";
import { CreatePurchaseDto } from "./dto/create-purchase.dto";
import { CreateReturnDto } from "./dto/create-return.dto";
import { CreateStockSupplyDto } from "./dto/create-stock-supply.dto";
import { ListStockSuppliesQueryDto } from "./dto/list-stock-supplies-query.dto";
import { UpdateStockSupplyDto } from "./dto/update-stock-supply.dto";
import { SetSimpleQuantityDto } from "./dto/set-simple-quantity.dto";
import {
  ProductStockListResponseDto,
  StockMovementListResponseDto,
  StockOperationResponseDto,
  VariantStockDto,
} from "./dto/stock-response.dto";
import {
  ApplyStockSupplyResponseDto,
  CreateStockSupplyResponseDto,
  StockSupplyListResponseDto,
  StockSupplyResponseDto,
} from "./dto/stock-supply-response.dto";
import { ListInventoryMovementsQueryDto } from "./dto/list-inventory-movements-query.dto";
import { ListStockHistoryQueryDto } from "./dto/list-stock-history-query.dto";
import { StockHistoryListResponseDto } from "./dto/stock-history-response.dto";
import { InventoryService } from "./inventory.service";

@ApiTags("inventory")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Post("simple/quantity")
  @ApiOperation({ summary: "Set absolute quantity (simple mode)" })
  @ApiCreatedResponse({ type: StockOperationResponseDto })
  setSimpleQuantity(
    @Req() req: { user?: AuthUser },
    @Body() dto: SetSimpleQuantityDto,
  ): Promise<StockOperationResponseDto> {
    return this.inventory.setSimpleQuantity(
      this.requireUserId(req),
      dto,
      req.user?.role,
      req.user?.workspaceId,
    );
  }

  @Post("stock/initial")
  @ApiOperation({ summary: "Record initial stock (advanced mode)" })
  @ApiCreatedResponse({ type: StockOperationResponseDto })
  createInitialStock(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateInitialStockDto,
  ): Promise<StockOperationResponseDto> {
    return this.inventory.createInitialStock(
      this.requireUserId(req),
      dto,
      req.user?.role,
      req.user?.workspaceId,
    );
  }

  @Post("stock/purchase")
  @ApiOperation({ summary: "Record purchase (advanced mode)" })
  @ApiCreatedResponse({ type: StockOperationResponseDto })
  createPurchase(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreatePurchaseDto,
  ): Promise<StockOperationResponseDto> {
    return this.inventory.createPurchase(
      this.requireUserId(req),
      dto,
      req.user?.role,
      req.user?.workspaceId,
    );
  }

  @Get("stock/supplies")
  @ApiOperation({
    summary: "List stock supplies",
    description:
      "Filters: `by=all|applied|not_applied` (or `status=all|applied|pending`), " +
      "`createdFrom` / `createdTo`, `createdBy` (user id), pagination.",
  })
  @ApiOkResponse({ type: StockSupplyListResponseDto })
  listStockSupplies(
    @Req() req: { user?: AuthUser },
    @Query() query: ListStockSuppliesQueryDto,
  ): Promise<StockSupplyListResponseDto> {
    return this.inventory.listStockSupplies(
      this.requireUserId(req),
      query,
      req.user?.role,
      req.user?.workspaceId,
    );
  }

  @Get("stock/supplies/:id")
  @ApiOperation({
    summary: "Get stock supply by id",
    description: "Includes line items (products/variants in the supply).",
  })
  @ApiOkResponse({ type: StockSupplyResponseDto })
  getStockSupply(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<StockSupplyResponseDto> {
    return this.inventory.getStockSupplyById(
      this.requireUserId(req),
      id,
      req.user?.role,
      req.user?.workspaceId,
    );
  }

  @Post("stock/supplies")
  @ApiOperation({
    summary: "Create stock supply / delivery batch (advanced mode)",
    description:
      "Body must include `immediatelyApply`. When false, creates a pending supply " +
      "(editable, no stock movements). When true, applies immediately. " +
      "Use POST /inventory/stock/supplies/:id/apply for pending supplies.",
  })
  @ApiCreatedResponse({ type: CreateStockSupplyResponseDto })
  createStockSupply(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateStockSupplyDto,
  ): Promise<CreateStockSupplyResponseDto> {
    return this.inventory.createStockSupply(
      this.requireUserId(req),
      dto,
      req.user?.role,
      req.user?.workspaceId,
    );
  }

  @Post("stock/supplies/:id/apply")
  @ApiOperation({
    summary: "Apply a pending stock supply",
    description:
      "Creates stock movements for each line and marks the supply as `applied`. " +
      "Fails if already applied.",
  })
  @ApiOkResponse({ type: ApplyStockSupplyResponseDto })
  applyStockSupply(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<ApplyStockSupplyResponseDto> {
    return this.inventory.applyStockSupply(
      this.requireUserId(req),
      id,
      req.user?.role,
      req.user?.workspaceId,
    );
  }

  @Patch("stock/supplies/:id")
  @ApiOperation({
    summary: "Edit a pending stock supply",
    description:
      "Allowed only while status is `pending` (not applied). Can replace `items` and/or `comment`.",
  })
  @ApiOkResponse({ type: StockSupplyResponseDto })
  updateStockSupply(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateStockSupplyDto,
  ): Promise<StockSupplyResponseDto> {
    return this.inventory.updateStockSupply(
      this.requireUserId(req),
      id,
      dto,
      req.user?.role,
      req.user?.workspaceId,
    );
  }

  @Post("stock/correction")
  @ApiOperation({
    summary: "Quantity correction / write-off (advanced mode)",
    description:
      "Negative quantityChange = write-off; provide free-text `reason` (e.g. брак). Positive change: reason optional.",
  })
  @ApiCreatedResponse({ type: StockOperationResponseDto })
  createCorrection(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateCorrectionDto,
  ): Promise<StockOperationResponseDto> {
    return this.inventory.createCorrection(
      this.requireUserId(req),
      dto,
      req.user?.role,
      req.user?.workspaceId,
    );
  }

  @Post("stock/inventory-count")
  @ApiOperation({ summary: "Inventory count (advanced mode)" })
  @ApiCreatedResponse({ type: StockOperationResponseDto })
  createInventoryCount(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateInventoryCountDto,
  ): Promise<StockOperationResponseDto> {
    return this.inventory.createInventory(
      this.requireUserId(req),
      dto,
      req.user?.role,
      req.user?.workspaceId,
    );
  }

  @Post("stock/return")
  @ApiOperation({ summary: "Customer return (advanced mode)" })
  @ApiCreatedResponse({ type: StockOperationResponseDto })
  createReturn(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateReturnDto,
  ): Promise<StockOperationResponseDto> {
    return this.inventory.createReturn(
      this.requireUserId(req),
      dto,
      req.user?.role,
      req.user?.workspaceId,
    );
  }

  @Get("history-movements")
  @ApiOperation({
    summary: "List stock movement history",
    description:
      "Returns merged supply batches and single stock movements with filters and pagination.",
  })
  @ApiOkResponse({ type: StockHistoryListResponseDto })
  listStockHistory(
    @Req() req: { user?: AuthUser },
    @Query() query: ListStockHistoryQueryDto,
  ): Promise<StockHistoryListResponseDto> {
    return this.inventory.listStockHistory(
      this.requireUserId(req),
      query,
      req.user?.role,
      req.user?.workspaceId,
    );
  }

  @Get("variants/:variantId/stock")
  @ApiOperation({ summary: "Get variant stock snapshot" })
  @ApiOkResponse({ type: VariantStockDto })
  getVariantStock(
    @Req() req: { user?: AuthUser },
    @Param("variantId", ParseIntPipe) variantId: number,
  ): Promise<VariantStockDto> {
    return this.inventory.getVariantStock(
      this.requireUserId(req),
      variantId,
      req.user?.role,
      req.user?.workspaceId,
    );
  }

  @Get("variants/:variantId/movements")
  @ApiOperation({ summary: "List stock movements for a variant" })
  @ApiOkResponse({ type: StockMovementListResponseDto })
  listMovements(
    @Req() req: { user?: AuthUser },
    @Param("variantId", ParseIntPipe) variantId: number,
    @Query() query: ListInventoryMovementsQueryDto,
  ): Promise<StockMovementListResponseDto> {
    return this.inventory.listVariantMovements(
      this.requireUserId(req),
      variantId,
      query.limit ?? 20,
      query.offset ?? 0,
      req.user?.role,
      req.user?.workspaceId,
    );
  }

  @Get("products/:productId/stock")
  @ApiOperation({ summary: "Get stock for all variants of a product" })
  @ApiOkResponse({ type: ProductStockListResponseDto })
  getProductStock(
    @Req() req: { user?: AuthUser },
    @Param("productId", ParseIntPipe) productId: number,
  ): Promise<ProductStockListResponseDto> {
    return this.inventory.getProductStock(
      this.requireUserId(req),
      productId,
      req.user?.role,
      req.user?.workspaceId,
    );
  }

  private requireUserId(req: { user?: AuthUser }): number {
    const userId = Number(req.user?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error("Authenticated user id is required");
    }
    return userId;
  }
}
