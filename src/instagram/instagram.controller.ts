import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import {
  AnalyzeInstagramProductRequestDto,
  AnalyzeInstagramProductResponseDto,
} from "./dto/analyze-instagram-product.dto";
import { InstagramMediaListResponseDto } from "./dto/instagram-media-response.dto";
import { InstagramProductAiService } from "./instagram-product-ai.service";
import { InstagramService } from "./instagram.service";

@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("api/instagram")
export class InstagramController {
  constructor(
    private readonly instagram: InstagramService,
    private readonly instagramProductAi: InstagramProductAiService,
  ) {}

  @Get("media")
  @ApiOperation({
    summary: "List Instagram media for your connected Business account",
    description:
      "Calls Meta Graph `GET /{instagram-business-account-id}/media` with your integration Page token and returns all pages of results (feed posts / reels metadata as returned by Graph). Requires `instagram_account_id` and `access_token` on your integration.",
  })
  @ApiOkResponse({ type: InstagramMediaListResponseDto })
  async listMedia(
    @Req() req: { user?: AuthUser },
  ): Promise<InstagramMediaListResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return this.instagram.listMediaForOwner(ownerId);
  }

  @Post("media/analyze-product")
  @ApiOperation({
    summary: "Infer product fields and category from an Instagram media id",
    description:
      "Loads the media from Instagram Graph, downloads the image (or carousel first image / video thumbnail), sends it to OpenAI with the caption and your workspace category list, and returns structured JSON. " +
      "Also creates a draft row in the catalog (`products`) with variants (colors × sizes), optional `category_id`, `mainImageUrl`, and a `product_source_references` row — see `catalogProductId` / `savedProduct` in the response. " +
      "Requires OPENAI_API_KEY and a vision-capable model (default OPENAI_PRODUCT_VISION_MODEL=gpt-4o-mini).",
  })
  @ApiBody({ type: AnalyzeInstagramProductRequestDto })
  @ApiOkResponse({ type: AnalyzeInstagramProductResponseDto })
  async analyzeProduct(
    @Req() req: { user?: AuthUser },
    @Body() body: AnalyzeInstagramProductRequestDto,
  ): Promise<AnalyzeInstagramProductResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return this.instagramProductAi.analyzeProductFromMedia(
      ownerId,
      body.mediaId.trim(),
    );
  }
}
