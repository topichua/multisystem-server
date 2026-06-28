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
import type { Request } from "express";
import { CreateInventoryMovementRequestDto } from "./dto/create-inventory-movement-request.dto";
import {
  CreateInventoryMovementResponseDto,
  InventoryMovementListResponseDto,
} from "./dto/inventory-movement-response.dto";
import { ListInventoryMovementsQueryDto } from "./dto/list-inventory-movements-query.dto";
import { InventoryMovementCriteriaResponseDto } from "./dto/inventory-criteria-response.dto";
import { InventoryService } from "./inventory.service";

@ApiTags("inventory")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("criteria")
  @ApiOperation({
    summary: "Inventory movement type/reason options",
    description:
      "Returns allowed `reason` values for each movement `type` when creating manual inventory movements.",
  })
  @ApiOkResponse({ type: InventoryMovementCriteriaResponseDto })
  getCriteria(): InventoryMovementCriteriaResponseDto {
    return this.inventory.getMovementCriteria();
  }

  @Get("variants/:variantId/movements")
  @ApiOperation({ summary: "List inventory movements for a variant" })
  @ApiOkResponse({ type: InventoryMovementListResponseDto })
  async listMovements(
    @Req() req: { user?: AuthUser },
    @Param("variantId", ParseIntPipe) variantId: number,
    @Query() query: ListInventoryMovementsQueryDto,
  ): Promise<InventoryMovementListResponseDto> {
    const userId = this.requireUserId(req);
    return this.inventory.listVariantMovements(
      userId,
      variantId,
      query.limit ?? 20,
      query.offset ?? 0,
      req.user?.role,
      req.user?.workspaceId,
    );
  }

  @Post("movements")
  @ApiOperation({ summary: "Create inventory movement" })
  @ApiCreatedResponse({ type: CreateInventoryMovementResponseDto })
  async createMovement(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateInventoryMovementRequestDto,
  ): Promise<CreateInventoryMovementResponseDto> {
    const userId = this.requireUserId(req);
    return this.inventory.createMovement(
      userId,
      dto,
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
