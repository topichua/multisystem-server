import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
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
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { ListOrdersQueryDto } from "../orders/dto/list-orders-query.dto";
import { OrdersService } from "../orders/orders.service";
import { ClientsService } from "./clients.service";
import { ClientLookupResponseDto } from "./dto/client-lookup-response.dto";
import { ClientResponseDto } from "./dto/client-response.dto";
import { ClientsListResponseDto } from "./dto/clients-list-response.dto";
import { CreateClientRequestDto } from "./dto/create-client-request.dto";
import { GetClientQueryDto } from "./dto/get-client-query.dto";
import { ListClientsQueryDto } from "./dto/list-clients-query.dto";
import { ClientOrderStatsResponseDto } from "./dto/client-order-stats-response.dto";
import { ClientWriteResponseDto } from "./dto/client-write-response.dto";
import { UpdateClientRequestDto } from "./dto/update-client-request.dto";

@ApiTags("clients")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("clients")
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly orders: OrdersService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List clients or look up by id / social user id",
    description:
      "**Lookup** (at most one of): `id`, `instagramUserId` / `instagramId`, `telegramUserId` — returns `ClientLookupResponseDto` (HTTP 200, `associated: false` if none). **List:** omit all lookup params — paginated workspace clients (`page` / `pageSize`, defaults 1 / 50). Pass `include_order_stat=true` to embed order aggregates on each client.",
  })
  @ApiOkResponse({
    description:
      "`ClientLookupResponseDto` when a lookup param is set; `ClientsListResponseDto` when listing.",
  })
  async listOrLookup(
    @Req() req: { user?: AuthUser },
    @Query() query: ListClientsQueryDto,
  ): Promise<ClientLookupResponseDto | ClientsListResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const includeOrderStat = query.include_order_stat === true;
    const statOptions = { includeOrderStat };
    const instagramUserId = query.instagramUserId ?? query.instagramId;
    const lookupModes = [
      query.id != null,
      instagramUserId != null,
      query.telegramUserId != null,
    ].filter(Boolean).length;
    if (lookupModes > 1) {
      throw new BadRequestException(
        "Provide at most one of id, instagramUserId, instagramId, or telegramUserId",
      );
    }

    if (query.id != null) {
      return this.clients.lookupByIdForOwner(ownerId, query.id, statOptions);
    }
    if (instagramUserId != null) {
      return this.clients.lookupByInstagramIdForOwner(
        ownerId,
        instagramUserId,
        statOptions,
      );
    }
    if (query.telegramUserId != null) {
      return this.clients.lookupByTelegramUserIdForOwner(
        ownerId,
        query.telegramUserId,
        statOptions,
      );
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    return this.clients.listPagedForOwner(
      ownerId,
      page,
      pageSize,
      statOptions,
    );
  }

  @Post()
  @ApiOperation({
    summary: "Create client",
    description:
      "Creates a client in your workspace. `first_name`, `last_name`, and `phone` are optional (stored as empty strings when omitted). " +
      "Optionally link one social account: `instagramUserId` **or** `telegramUserId` (not both). " +
      "Omit both (or pass null) for a client with no platform link.",
  })
  @ApiBody({ type: CreateClientRequestDto })
  @ApiCreatedResponse({ type: ClientWriteResponseDto })
  async create(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateClientRequestDto,
  ): Promise<ClientWriteResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.clients.createForOwner(ownerId, dto);
  }

  @Get(":id/orders/stats")
  @ApiOperation({
    summary: "Order stats for client",
    description:
      "Aggregates over all orders where this client is the customer: count, total spent (`totalAmount` sum), average order total, and date of the latest order.",
  })
  @ApiOkResponse({ type: ClientOrderStatsResponseDto })
  async getOrderStatsForClient(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
  ): Promise<ClientOrderStatsResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const clientId = this.parsePositiveInt(id, "id");
    return this.orders.getOrderStatsForClient(ownerId, clientId);
  }

  @Get(":id/orders")
  @ApiOperation({
    summary: "List orders for client",
    description:
      "Returns paginated orders for which this client is the customer (`customer_id`), scoped to your workspace. Same query params as `GET /orders`.",
  })
  async listOrdersForClient(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
    @Query() query: ListOrdersQueryDto,
  ) {
    const ownerId = this.requireNumericOwnerId(req);
    const clientId = this.parsePositiveInt(id, "id");
    return this.orders.listOrdersForClient(ownerId, clientId, query);
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get client by id",
    description:
      "Returns the client if it exists in your workspace (`workspace_id` from your integration). Pass `include_order_stat=true` to embed order aggregates.",
  })
  @ApiOkResponse({ type: ClientResponseDto })
  async getById(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
    @Query() query: GetClientQueryDto,
  ): Promise<ClientResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const clientId = this.parsePositiveInt(id, "id");
    return this.clients.getByIdForOwner(ownerId, clientId, {
      includeOrderStat: query.include_order_stat === true,
    });
  }

  @Put(":id")
  @ApiOperation({
    summary: "Update client",
    description:
      "Partial update. Set `instagramUserId` or `telegramUserId` to null / `\"\"` to clear a link. Only one platform link is allowed per client. `avatar_src` is read-only (GET only).",
  })
  @ApiBody({ type: UpdateClientRequestDto })
  @ApiOkResponse({ type: ClientWriteResponseDto })
  async update(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
    @Body() dto: UpdateClientRequestDto,
  ): Promise<ClientWriteResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const clientId = this.parsePositiveInt(id, "id");
    return this.clients.updateForOwner(ownerId, clientId, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete client" })
  @ApiNoContentResponse()
  async remove(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
  ): Promise<void> {
    const ownerId = this.requireNumericOwnerId(req);
    const clientId = this.parsePositiveInt(id, "id");
    await this.clients.deleteForOwner(ownerId, clientId);
  }

  private requireNumericOwnerId(req: { user?: AuthUser }): number {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return ownerId;
  }

  private parsePositiveInt(raw: string, field: string): number {
    const t = raw?.trim() ?? "";
    if (!/^\d+$/.test(t)) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    const n = Number(t);
    if (!Number.isInteger(n) || n <= 0) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    return n;
  }
}
