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
  ApiExtraModels,
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
  ListAutomationHistoryQueryDto,
  ListAutomationScheduledQueryDto,
  ListOrderStatusAutomationsQueryDto,
  SetOrderStatusAutomationActiveDto,
  UpdateOrderStatusAutomationDto,
} from "./dto/order-status-automation.dto";
import {
  OrderStatusAutomationResponseDto,
  OrderStatusAutomationsListResponseDto,
} from "./dto/order-status-automation-response.dto";
import {
  OrderStatusAutomationCriteriaItemDto,
  OrderStatusAutomationCriteriaResponseDto,
  OrderStatusAutomationOrderTemplateCriteriaItemDto,
  OrderStatusAutomationTargetCriteriaItemDto,
} from "./dto/order-status-automation-criteria-response.dto";
import {
  AutomationHistoryItemDto,
  AutomationHistoryListResponseDto,
  AutomationScheduledItemDto,
  AutomationScheduledListResponseDto,
} from "./dto/automation-activity-response.dto";
import { OrderStatusAutomationsService } from "./order-status-automations.service";

@ApiTags("automation_rule")
@ApiBearerAuth("bearer")
@ApiExtraModels(
  OrderStatusAutomationCriteriaResponseDto,
  OrderStatusAutomationCriteriaItemDto,
  OrderStatusAutomationTargetCriteriaItemDto,
  OrderStatusAutomationOrderTemplateCriteriaItemDto,
  AutomationHistoryItemDto,
  AutomationScheduledItemDto,
)
@UseGuards(JwtAuthGuard)
@Controller("automation_rule")
export class OrderStatusAutomationsController {
  constructor(private readonly automations: OrderStatusAutomationsService) {}

  @Get("criteria")
  @ApiOperation({
    summary: "List automation rule builder criteria",
    description:
      "Returns delivery and payment codes for `conditions[].sourceStatus`, " +
      "workspace order statuses for `targetOrderStatusId` / `ORDER_STATUS`, " +
      "conversation groups for `targetConversationGroupId` (CHANGE_CONVERSATION_GROUP), " +
      "and order templates for `targetTemplateId` (SEND_MESSAGE).",
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

  @Get("history")
  @ApiOperation({
    summary: "List automation execution history",
    description:
      "APPLIED / SKIPPED / FAILED audit log for all action types (including SEND_MESSAGE).",
  })
  @ApiOkResponse({ type: AutomationHistoryListResponseDto })
  listHistory(
    @Req() req: { user?: AuthUser },
    @Query() query: ListAutomationHistoryQueryDto,
  ): Promise<AutomationHistoryListResponseDto> {
    return this.automations.listHistoryForUser(
      this.requireUserId(req),
      query,
      req.user?.role,
    );
  }

  @Get("scheduled")
  @ApiOperation({
    summary: "List scheduled SEND_MESSAGE jobs",
    description:
      "Upcoming (and optionally past) deferred message jobs. Default status filter: PENDING.",
  })
  @ApiOkResponse({ type: AutomationScheduledListResponseDto })
  listScheduled(
    @Req() req: { user?: AuthUser },
    @Query() query: ListAutomationScheduledQueryDto,
  ): Promise<AutomationScheduledListResponseDto> {
    return this.automations.listScheduledForUser(
      this.requireUserId(req),
      query,
      req.user?.role,
    );
  }

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
      "Creates a rule with conditions combined by `conditionType` (`OR` or `AND`) " +
      "and one action: CHANGE_ORDER_STATUS, CHANGE_CONVERSATION_GROUP, or SEND_MESSAGE.",
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
      "Partial update. Sending `conditions` replaces the full condition list. " +
      "`conditionType` (or `condition_type`) controls OR vs AND matching.",
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
