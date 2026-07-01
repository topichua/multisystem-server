import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { ClientsService } from "./clients.service";
import { AddClientLinkRequestDto } from "./dto/add-client-link-request.dto";
import { ClientWriteResponseDto } from "./dto/client-write-response.dto";

@ApiTags("clients")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("clients/:id/links")
export class ClientLinksController {
  constructor(private readonly clients: ClientsService) {}

  @Post()
  @ApiOperation({
    summary: "POST /clients/{id}/links — attach social link",
    description:
      "Adds one row to `client_links` for an existing client (`provider` + `externalId`). " +
      "Idempotent when the same link is already on this client. HTTP 409 if another client in the workspace uses the same external id.",
  })
  @ApiParam({ name: "id", type: Number, description: "Client primary key" })
  @ApiBody({ type: AddClientLinkRequestDto })
  @ApiCreatedResponse({
    type: ClientWriteResponseDto,
    description: "Updated client with full `instagramUserIds` / `telegramUserIds` arrays.",
  })
  async addLink(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
    @Body() dto: AddClientLinkRequestDto,
  ): Promise<ClientWriteResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const clientId = this.parsePositiveInt(id, "id");
    const externalId = dto.resolvedExternalId();
    if (!externalId) {
      throw new BadRequestException(
        "externalId is required (or use deprecated instagramUserId / telegramUserId matching provider)",
      );
    }
    return this.clients.addLinkForOwner(
      ownerId,
      clientId,
      dto.provider,
      externalId,
    );
  }

  @Delete()
  @ApiOperation({
    summary: "DELETE /clients/{id}/links — detach social link",
    description:
      "Removes one row from `client_links` for this client (`provider` + `externalId`). " +
      "Idempotent when the link is already absent — returns the current client.",
  })
  @ApiParam({ name: "id", type: Number, description: "Client primary key" })
  @ApiBody({ type: AddClientLinkRequestDto })
  @ApiOkResponse({
    type: ClientWriteResponseDto,
    description: "Updated client with full `instagramUserIds` / `telegramUserIds` arrays.",
  })
  async removeLink(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
    @Body() dto: AddClientLinkRequestDto,
  ): Promise<ClientWriteResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const clientId = this.parsePositiveInt(id, "id");
    const externalId = dto.resolvedExternalId();
    if (!externalId) {
      throw new BadRequestException(
        "externalId is required (or use deprecated instagramUserId / telegramUserId matching provider)",
      );
    }
    return this.clients.removeLinkForOwner(
      ownerId,
      clientId,
      dto.provider,
      externalId,
    );
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
