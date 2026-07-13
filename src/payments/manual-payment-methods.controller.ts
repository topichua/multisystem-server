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
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
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
  CreateManualPaymentMethodDto,
  ManualPaymentMethodResponseDto,
  ManualPaymentMethodsListResponseDto,
  UpdateManualPaymentMethodDto,
} from "./dto/manual-payment-method.dto";
import { ManualPaymentMethodsService } from "./manual-payment-methods.service";

@ApiTags("workspace")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("workspace/manual-payment-methods")
export class ManualPaymentMethodsController {
  constructor(private readonly methods: ManualPaymentMethodsService) {}

  @Get()
  @ApiOperation({
    summary: "List manual payment methods (IBAN / card) for workspace",
  })
  @ApiOkResponse({ type: ManualPaymentMethodsListResponseDto })
  list(
    @Req() req: { user?: AuthUser },
  ): Promise<ManualPaymentMethodsListResponseDto> {
    return this.methods.listForUser(this.requireUserId(req), req.user?.role);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create manual payment method" })
  @ApiCreatedResponse({ type: ManualPaymentMethodResponseDto })
  create(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateManualPaymentMethodDto,
  ): Promise<ManualPaymentMethodResponseDto> {
    return this.methods.createForUser(
      this.requireUserId(req),
      dto,
      req.user?.role,
    );
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update manual payment method" })
  @ApiParam({ name: "id", type: Number })
  @ApiOkResponse({ type: ManualPaymentMethodResponseDto })
  update(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateManualPaymentMethodDto,
  ): Promise<ManualPaymentMethodResponseDto> {
    return this.methods.updateForUser(
      this.requireUserId(req),
      id,
      dto,
      req.user?.role,
    );
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete manual payment method" })
  @ApiParam({ name: "id", type: Number })
  @ApiNoContentResponse()
  async delete(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<void> {
    await this.methods.deleteForUser(
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
