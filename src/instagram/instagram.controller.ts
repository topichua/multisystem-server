import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Body,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import {
  AnalyzeInstagramProductQueryDto,
  InstagramAnalyzeProductPreviewDto,
} from "./dto/analyze-instagram-product.dto";
import { ProductInstagramReferencesService } from "../product-instagram-references/product-instagram-references.service";
import { InstagramPostAiExtractionQueryDto } from "./dto/instagram-post-ai-extraction-query.dto";
import { InstagramPostAiExtractionResponseDto } from "./dto/instagram-post-ai-extraction-response.dto";
import { InstagramPostProductVariantsResponseDto } from "./dto/instagram-post-product-variants-response.dto";
import { InstagramIntegrationsListResponseDto } from "./dto/instagram-integration-list-item.dto";
import { InstagramMediaListResponseDto } from "./dto/instagram-media-response.dto";
import { InstagramPostCommentsListResponseDto } from "./dto/instagram-post-comments-response.dto";
import { ListInstagramCommentRepliesQueryDto } from "./dto/list-instagram-comment-replies-query.dto";
import { ListInstagramMediaQueryDto } from "./dto/list-instagram-media-query.dto";
import { ListInstagramPostCommentsQueryDto } from "./dto/list-instagram-post-comments-query.dto";
import {
  ReplyInstagramCommentQueryDto,
  ReplyInstagramCommentRequestDto,
} from "./dto/reply-instagram-comment.dto";
import { ReplyInstagramCommentResponseDto } from "./dto/reply-instagram-comment-response.dto";
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
    private readonly productInstagramReferences: ProductInstagramReferencesService,
  ) {}

  @Get("integrations")
  @ApiOperation({
    summary: "List connected Instagram integrations",
    description:
      "Returns connected Instagram integrations with profile fields (`name`, `userName`, `avatar`, `businessAccountId`). " +
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

  @Get("posts/:instagramPostId/comments")
  @ApiOperation({
    summary: "List comments on an Instagram post",
    description:
      "Calls Meta Graph `GET /{instagram-media-id}/comments` with the integration Page token. " +
      "By default returns top-level comments only with lightweight `reply_count` / `has_replies` " +
      "(no reply bodies). Load replies on demand via GET .../comments/:commentId/replies. " +
      "Comment authors are enriched from `instagram_users` (`from.name`, `from.profilePic`). " +
      "Set `include_replies=true` only if you need embedded replies in one response (heavier). " +
      "Pass `integrationId` from GET /api/instagram/integrations when you have multiple accounts. " +
      "Use `limit` (default 25, max 50) and Graph cursors `after` / `before` from `paging.cursors` to paginate.",
  })
  @ApiOkResponse({ type: InstagramPostCommentsListResponseDto })
  async listPostComments(
    @Req() req: { user?: AuthUser },
    @Param("instagramPostId") instagramPostId: string,
    @Query() query: ListInstagramPostCommentsQueryDto,
  ): Promise<InstagramPostCommentsListResponseDto> {
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
    return this.instagram.listCommentsForPostForOwner(ownerId, id, query);
  }

  @Get("posts/:instagramPostId/comments/:commentId/replies")
  @ApiOperation({
    summary: "List replies on an Instagram comment",
    description:
      "Calls Meta Graph `GET /{ig-comment-id}/replies`. Use after checking `has_replies` on the parent " +
      "comment from GET /api/instagram/posts/:instagramPostId/comments. " +
      "Pass `integrationId` when you have multiple connected Instagram accounts.",
  })
  @ApiParam({ name: "instagramPostId", description: "Instagram Graph media/post id" })
  @ApiParam({ name: "commentId", description: "Parent comment id from GET .../comments" })
  @ApiOkResponse({ type: InstagramPostCommentsListResponseDto })
  async listCommentReplies(
    @Req() req: { user?: AuthUser },
    @Param("instagramPostId") instagramPostId: string,
    @Param("commentId") commentId: string,
    @Query() query: ListInstagramCommentRepliesQueryDto,
  ): Promise<InstagramPostCommentsListResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    const postId = instagramPostId?.trim();
    if (!postId || postId.length > 128) {
      throw new BadRequestException("instagramPostId is invalid");
    }
    const id = commentId?.trim();
    if (!id || id.length > 128) {
      throw new BadRequestException("commentId is invalid");
    }
    return this.instagram.listRepliesForCommentForOwner(ownerId, id, query);
  }

  @Post("posts/:instagramPostId/comments/:commentId/reply")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Reply to an Instagram comment",
    description:
      "Calls Meta Graph `POST /{ig-comment-id}/replies` with the integration Page token. " +
      "Only top-level comments can be replied to. Pass `integrationId` when you have multiple connected accounts.",
  })
  @ApiParam({ name: "instagramPostId", description: "Instagram Graph media/post id" })
  @ApiParam({ name: "commentId", description: "Parent comment id from GET .../comments" })
  @ApiCreatedResponse({ type: ReplyInstagramCommentResponseDto })
  async replyToComment(
    @Req() req: { user?: AuthUser },
    @Param("instagramPostId") instagramPostId: string,
    @Param("commentId") commentId: string,
    @Query() query: ReplyInstagramCommentQueryDto,
    @Body() dto: ReplyInstagramCommentRequestDto,
  ): Promise<ReplyInstagramCommentResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    const postId = instagramPostId?.trim();
    if (!postId || postId.length > 128) {
      throw new BadRequestException("instagramPostId is invalid");
    }
    const id = commentId?.trim();
    if (!id || id.length > 128) {
      throw new BadRequestException("commentId is invalid");
    }
    return this.instagram.replyToCommentForOwner(
      ownerId,
      id,
      dto.message,
      query,
    );
  }

  @Get("posts/:instagramPostId/product-variants")
  @ApiOperation({
    summary: "List products and variants referenced for an Instagram post",
    description:
      "Returns products grouped by id (same shape as GET /products items) with `referenceId` on each " +
      "linked variant. Variant-specific references include only that variant; product-level references " +
      "include all variants with the same `referenceId`.",
  })
  @ApiOkResponse({ type: InstagramPostProductVariantsResponseDto })
  async listProductVariantsForPost(
    @Req() req: { user?: AuthUser },
    @Param("instagramPostId") instagramPostId: string,
    @Query() query: InstagramPostAiExtractionQueryDto,
  ): Promise<InstagramPostProductVariantsResponseDto> {
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
    return this.productInstagramReferences.listProductsForPost(
      ownerId,
      id,
      query.integrationId,
    );
  }

  @Delete("posts/:instagramPostId/product-references/:referenceId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Remove a product Instagram reference from a post",
    description:
      "Deletes `product_instagram_references` by id. The reference must belong to the given post " +
      "and integration (`integrationId` query param).",
  })
  @ApiNoContentResponse()
  async removeProductReferenceForPost(
    @Req() req: { user?: AuthUser },
    @Param("instagramPostId") instagramPostId: string,
    @Param("referenceId", ParseIntPipe) referenceId: number,
    @Query() query: InstagramPostAiExtractionQueryDto,
  ): Promise<void> {
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
    await this.productInstagramReferences.removeReferenceForPost(
      ownerId,
      id,
      referenceId,
      query.integrationId,
    );
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
