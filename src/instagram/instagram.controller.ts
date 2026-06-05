import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import {
  AnalyzeInstagramProductQueryDto,
  InstagramAnalyzeProductPreviewDto,
} from "./dto/analyze-instagram-product.dto";
import { InstagramPostAiExtractionResponseDto } from "./dto/instagram-post-ai-extraction-response.dto";
import { InstagramMediaListResponseDto } from "./dto/instagram-media-response.dto";
import { InstagramPostAiExtractionService } from "./instagram-post-ai-extraction.service";
import { InstagramProductAiService } from "./instagram-product-ai.service";
import { InstagramService } from "./instagram.service";

@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("api/instagram")
export class InstagramController {
  constructor(
    private readonly instagram: InstagramService,
    private readonly instagramProductAi: InstagramProductAiService,
    private readonly instagramPostAiExtraction: InstagramPostAiExtractionService,
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

  @Get("posts/:instagramPostId/ai-extraction")
  @ApiOperation({
    summary: "AI extraction from Instagram post (read-only)",
    description:
      "Analyzes post caption, media, images/video previews, and categories with OpenAI. " +
      "Returns product fields, generic attributes, and matchedFields mapped to workspace custom fields. " +
      "Read-only — does not write to the database.",
  })
  @ApiOkResponse({ type: InstagramPostAiExtractionResponseDto })
  async extractPostForProductForm(
    @Req() req: { user?: AuthUser },
    @Param("instagramPostId") instagramPostId: string,
  ): Promise<InstagramPostAiExtractionResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    const id = instagramPostId?.trim();
    if (!id || id.length > 128) {
      throw new BadRequestException("instagramPostId is invalid");
    }
    return this.instagramPostAiExtraction.extractPostForProductForm(ownerId, id);
  }

  @Get("analyze-product")
  @ApiOperation({
    summary: "Preview product fields from Instagram media (no catalog write)",
    description:
      "Loads a single Graph media item, runs vision + OpenAI, and returns suggested fields. Pass the Graph media id as query `mediaId`. Does not create a product or source reference.",
  })
  @ApiOkResponse({ type: InstagramAnalyzeProductPreviewDto })
  async analyzeProductPreview(
    @Req() req: { user?: AuthUser },
    @Query() query: AnalyzeInstagramProductQueryDto,
  ): Promise<InstagramAnalyzeProductPreviewDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return this.instagramProductAi.analyzeProductPreviewFromMedia(
      ownerId,
      query.mediaId.trim(),
    );
  }
}
