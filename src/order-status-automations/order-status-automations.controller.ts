import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import {
  CreateOrderStatusAutomationDto,
  ListOrderStatusAutomationsQueryDto,
  SetOrderStatusAutomationActiveDto,
  UpdateOrderStatusAutomationDto,
} from "./dto/order-status-automation.dto";
import {
  OrderStatusAutomationResponseDto,
  OrderStatusAutomationsListResponseDto,
} from "./dto/order-status-automation-response.dto";
import { OrderStatusAutomationCriteriaResponseDto } from "./dto/order-status-automation-criteria-response.dto";
import { OrderStatusAutomationsService } from "./order-status-automations.service";

@ApiTags("order-status-automations")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("order-status-automations")
export class OrderStatusAutomationsController {
  constructor(private readonly automations: OrderStatusAutomationsService) {}

  @Get()
  @ApiOperation({ summary: "List order status automations for workspace" })
  @ApiOkResponse({ type: OrderStatusAutomationsListResponseDto })
  list(
    @Req() req: { user?: AuthUser },
    @Query() query: ListOrderStatusAutomationsQueryDto,
  ): Promise<OrderStatusAutomationsListResponseDto> {
    return this.automations.listForUser(
      this.requireUserId(req),
      query,
      req.user?.role,
    );
  }

  @Get("criteria")
  @ApiOperation({
    summary: "List automation rule builder criteria",
    description:
      "Returns delivery and payment status options for `conditions[].sourceStatus`. " +
      "Use delivery/payment `id` values when creating or updating automations.",
  })
  @ApiOkResponse({ type: OrderStatusAutomationCriteriaResponseDto })
  getCriteria(
    @Req() req: { user?: AuthUser },
  ): Promise<OrderStatusAutomationCriteriaResponseDto> {
    return this.automations.getCriteriaForUser(
      this.requireUserId(req),
      req.user?.role,
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Get order status automation by id" })
  @ApiParam({ name: "id", type: Number })
  @ApiOkResponse({ type: OrderStatusAutomationResponseDto })
  getById(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<OrderStatusAutomationResponseDto> {
    return this.automations.getByIdForUser(
      this.requireUserId(req),
      id,
      req.user?.role,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create order status automation",
    description:
      "Creates a rule with OR conditions (`conditions[]`) and a single action: change order status.",
  })
  @ApiBody({ type: CreateOrderStatusAutomationDto })
  @ApiCreatedResponse({ type: OrderStatusAutomationResponseDto })
  create(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateOrderStatusAutomationDto,
  ): Promise<OrderStatusAutomationResponseDto> {
    return this.automations.createForUser(
      this.requireUserId(req),
      dto,
      req.user?.role,
    );
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Update order status automation",
    description:
      "Partial update. Sending `conditions` replaces the full OR condition list.",
  })
  @ApiBody({ type: UpdateOrderStatusAutomationDto })
  @ApiParam({ name: "id", type: Number })
  @ApiOkResponse({ type: OrderStatusAutomationResponseDto })
  update(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusAutomationDto,
  ): Promise<OrderStatusAutomationResponseDto> {
    return this.automations.updateForUser(
      this.requireUserId(req),
      id,
      dto,
      req.user?.role,
    );
  }

  @Patch(":id/active")
  @ApiOperation({ summary: "Enable or disable order status automation" })
  @ApiBody({ type: SetOrderStatusAutomationActiveDto })
  @ApiParam({ name: "id", type: Number })
  @ApiOkResponse({ type: OrderStatusAutomationResponseDto })
  setActive(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: SetOrderStatusAutomationActiveDto,
  ): Promise<OrderStatusAutomationResponseDto> {
    return this.automations.setActiveForUser(
      this.requireUserId(req),
      id,
      dto.isActive,
      req.user?.role,
    );
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete order status automation (soft delete)" })
  @ApiParam({ name: "id", type: Number })
  @ApiNoContentResponse()
  async delete(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<void> {
    await this.automations.deleteForUser(
      this.requireUserId(req),
      id,
      req.user?.role,
    );
  }

  private requireUserId(req: { user?: AuthUser }): number {
    const userId = Number(req.user?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException("Unauthorized");
    }
    return userId;
  }
}
