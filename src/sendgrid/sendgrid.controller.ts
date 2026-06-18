import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { SendPriceEmailRequestDto } from "./dto/send-price-email-request.dto";
import { SendPriceEmailResponseDto } from "./dto/send-price-email-response.dto";
import { SendgridService } from "./sendgrid.service";

@ApiTags("emails")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("emails")
export class SendgridController {
  constructor(private readonly sendgrid: SendgridService) {}

  @Post("price")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Send price email via SendGrid dynamic template",
    description:
      "Sends a SendGrid dynamic template email with the `price` template variable filled.",
  })
  @ApiBody({ type: SendPriceEmailRequestDto })
  @ApiOkResponse({ type: SendPriceEmailResponseDto })
  async sendPriceEmail(
    @Req() req: { user?: AuthUser },
    @Body() dto: SendPriceEmailRequestDto,
  ): Promise<SendPriceEmailResponseDto> {
    this.requireUserId(req);
    await this.sendgrid.sendPriceEmail(dto.to, dto.price);
    return { sent: true };
  }

  private requireUserId(req: { user?: AuthUser }): number {
    const userId = Number(req.user?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric user id",
      );
    }
    return userId;
  }
}
