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
import { ClientsService } from "./clients.service";
import { ClientLookupResponseDto } from "./dto/client-lookup-response.dto";
import { ClientResponseDto } from "./dto/client-response.dto";
import { ClientsListResponseDto } from "./dto/clients-list-response.dto";
import { CreateClientRequestDto } from "./dto/create-client-request.dto";
import { ListClientsQueryDto } from "./dto/list-clients-query.dto";
import { UpdateClientRequestDto } from "./dto/update-client-request.dto";

@ApiTags("clients")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("clients")
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @ApiOperation({
    summary: "List clients or look up by Instagram id",
    description:
      "**Modes:** (1) Pass `instagramId` — same as before: one lookup in your workspace; HTTP 200 with `associated: false` if none. (2) Omit `instagramId` — paginated list of all clients in your workspace (`page` / `pageSize`, defaults 1 / 50).",
  })
  @ApiOkResponse({
    description:
      "`ClientLookupResponseDto` when `instagramId` is set; `ClientsListResponseDto` when listing.",
  })
  async listOrLookup(
    @Req() req: { user?: AuthUser },
    @Query() query: ListClientsQueryDto,
  ): Promise<ClientLookupResponseDto | ClientsListResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    if (query.instagramId !== undefined) {
      return this.clients.lookupByInstagramIdForOwner(
        ownerId,
        query.instagramId,
      );
    }
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    return this.clients.listPagedForOwner(ownerId, page, pageSize);
  }

  @Post()
  @ApiOperation({
    summary: "Create client",
    description:
      "Creates a client in your workspace. `instagramId` is optional; omit or leave empty for a client without a linked `instagram_users` row.",
  })
  @ApiBody({ type: CreateClientRequestDto })
  @ApiCreatedResponse({ type: ClientResponseDto })
  async create(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateClientRequestDto,
  ): Promise<ClientResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.clients.createForOwner(ownerId, dto);
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get client by id",
    description:
      "Returns the client if it exists in your workspace (`workspace_id` from your integration).",
  })
  @ApiOkResponse({ type: ClientResponseDto })
  async getById(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
  ): Promise<ClientResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const clientId = this.parsePositiveInt(id, "id");
    return this.clients.getByIdForOwner(ownerId, clientId);
  }

  @Put(":id")
  @ApiOperation({
    summary: "Update client",
    description:
      'Partial update. Set `instagramId` to null or `""` to clear the Instagram link.',
  })
  @ApiBody({ type: UpdateClientRequestDto })
  @ApiOkResponse({ type: ClientResponseDto })
  async update(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
    @Body() dto: UpdateClientRequestDto,
  ): Promise<ClientResponseDto> {
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
