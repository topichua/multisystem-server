import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import {
  AnalyzeInstagramProductQueryDto,
  InstagramAnalyzeProductPreviewDto,
} from "./dto/analyze-instagram-product.dto";
import { InstagramPostAiExtractionQueryDto } from "./dto/instagram-post-ai-extraction-query.dto";
import { InstagramPostAiExtractionResponseDto } from "./dto/instagram-post-ai-extraction-response.dto";
import { InstagramIntegrationsListResponseDto } from "./dto/instagram-integration-list-item.dto";
import { InstagramMediaListResponseDto } from "./dto/instagram-media-response.dto";
import { ListInstagramMediaQueryDto } from "./dto/list-instagram-media-query.dto";
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

  @Get("integrations")
  @ApiOperation({
    summary: "List connected Instagram integrations",
    description:
      "Returns `id` and `name` for each connected Instagram integration in your workspace. " +
      "Use `id` as `integrationId` on GET /api/instagram/media and GET /api/instagram/posts/:id/ai-extraction.",
  })
  @ApiQuery({
    name: "workspace_id",
    required: false,
    description:
      "Workspace to list; must be accessible to the authenticated user. Defaults to your primary workspace.",
    schema: { type: "integer", minimum: 1 },
  })
  @ApiOkResponse({ type: InstagramIntegrationsListResponseDto })
  async listIntegrations(
    @Req() req: { user?: AuthUser },
    @Query("workspace_id") workspaceIdRaw?: string,
  ): Promise<InstagramIntegrationsListResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }

    let workspaceId: number | undefined;
    if (workspaceIdRaw != null && workspaceIdRaw.trim() !== "") {
      workspaceId = Number(workspaceIdRaw.trim());
      if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
        throw new BadRequestException("workspace_id must be a positive integer");
      }
    }

    return this.instagram.listIntegrationsForOwner(ownerId, workspaceId);
  }

  @Get("media")
  @ApiOperation({
    summary: "List Instagram media for a connected Business account",
    description:
      "Calls Meta Graph `GET /{instagram-business-account-id}/media` with the integration Page token and returns one page of results. " +
      "Pass `integrationId` from GET /api/instagram/integrations when you have multiple accounts; otherwise the latest connected integration is used. " +
      "Use `limit` (default 25, max 100) and Graph cursors `after` / `before` from `paging.cursors` to paginate.",
  })
  @ApiOkResponse({ type: InstagramMediaListResponseDto })
  async listMedia(
    @Req() req: { user?: AuthUser },
    @Query() query: ListInstagramMediaQueryDto,
  ): Promise<InstagramMediaListResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return this.instagram.listMediaForOwner(ownerId, query);
  }

  @Get("posts/:instagramPostId/ai-extraction")
  @ApiOperation({
    summary: "AI extraction from Instagram post (read-only)",
    description:
      "Analyzes post caption, media, images/video previews, and categories with OpenAI. " +
      "Returns product fields, generic attributes, and matchedFields mapped to workspace custom fields. " +
      "Pass `integrationId` from GET /api/instagram/integrations to use the correct Page token. " +
      "Read-only — does not write to the database.",
  })
  @ApiOkResponse({ type: InstagramPostAiExtractionResponseDto })
  async extractPostForProductForm(
    @Req() req: { user?: AuthUser },
    @Param("instagramPostId") instagramPostId: string,
    @Query() query: InstagramPostAiExtractionQueryDto,
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
    return this.instagramPostAiExtraction.extractPostForProductForm(
      ownerId,
      id,
      query.integrationId,
    );
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
