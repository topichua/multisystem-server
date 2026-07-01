import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { SetSimpleQuantityDto } from "./dto/set-simple-quantity.dto";
import {
  ProductStockListResponseDto,
  StockMovementListResponseDto,
  StockOperationResponseDto,
  VariantStockDto,
} from "./dto/stock-response.dto";
import { ListInventoryMovementsQueryDto } from "./dto/list-inventory-movements-query.dto";
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
