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
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { ListTikTokCommentsQueryDto } from "./dto/list-tiktok-comments-query.dto";
import { ListTikTokVideosQueryDto } from "./dto/list-tiktok-videos-query.dto";
import { TikTokCommentsDiagnoseResponseDto } from "./dto/tiktok-comments-diagnose.dto";
import { TikTokCommentsListResponseDto } from "./dto/tiktok-comments-response.dto";
import { TikTokVideosListResponseDto } from "./dto/tiktok-videos-response.dto";
import { TikTokService } from "./tiktok.service";

@ApiTags("tiktok")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("api/tiktok")
export class TikTokController {
  constructor(private readonly tikTok: TikTokService) {}

  @Get("videos")
  @ApiOperation({
    summary: "List my TikTok videos",
    description:
      "Calls TikTok `POST /v2/video/list/` with the connected account token. " +
      "Requires OAuth scope `video.list`. Pass `integrationId` when multiple TikTok accounts are connected.",
  })
  @ApiOkResponse({ type: TikTokVideosListResponseDto })
  async listVideos(
    @Req() req: { user?: AuthUser },
    @Query() query: ListTikTokVideosQueryDto,
  ): Promise<TikTokVideosListResponseDto> {
    return this.tikTok.listVideosForOwner(this.requireOwnerId(req), query);
  }

  @Get("comments/diagnose")
  @ApiOperation({
    summary: "Diagnose why TikTok comment.list fails",
    description:
      "Probes TikTok `GET` then `POST` `/v2/video/comment/list/` and returns a structured " +
      "explanation (`reason`, `fix`, granted scopes, raw `attempts[].responseJson`). " +
      "Always 200 when the integration exists — use this instead of guessing from opaque 400s.",
  })
  @ApiOkResponse({ type: TikTokCommentsDiagnoseResponseDto })
  async diagnoseComments(
    @Req() req: { user?: AuthUser },
    @Query() query: ListTikTokCommentsQueryDto,
  ): Promise<TikTokCommentsDiagnoseResponseDto> {
    const videoId = query.videoId?.trim();
    if (!videoId) {
      throw new BadRequestException("videoId query param is required");
    }
    return this.tikTok.diagnoseCommentsForOwner(
      this.requireOwnerId(req),
      videoId,
      query,
    );
  }

  @Get("comments")
  @ApiOperation({
    summary: "List comments on one of my TikTok videos",
    description:
      "Calls TikTok `GET /v2/video/comment/list/` (falls back to POST) for a video you own. " +
      "Requires OAuth scope `comment.list`. On failure returns `reason`, `fix`, and `attempts` with TikTok JSON. " +
      "Or use GET /api/tiktok/comments/diagnose?videoId=… first.",
  })
  @ApiOkResponse({ type: TikTokCommentsListResponseDto })
  async listMyComments(
    @Req() req: { user?: AuthUser },
    @Query() query: ListTikTokCommentsQueryDto,
  ): Promise<TikTokCommentsListResponseDto> {
    const videoId = query.videoId?.trim();
    if (!videoId) {
      throw new BadRequestException(
        "videoId query param is required (TikTok video id from GET /api/tiktok/videos)",
      );
    }
    return this.tikTok.listCommentsForOwner(
      this.requireOwnerId(req),
      videoId,
      query,
    );
  }

  @Get("videos/:videoId/comments")
  @ApiOperation({
    summary: "List comments on a TikTok video",
    description:
      "Same as GET /api/tiktok/comments?videoId=… — path-style alias matching Instagram's comments route shape.",
  })
  @ApiParam({ name: "videoId", description: "TikTok video id" })
  @ApiOkResponse({ type: TikTokCommentsListResponseDto })
  async listVideoComments(
    @Req() req: { user?: AuthUser },
    @Param("videoId") videoId: string,
    @Query() query: ListTikTokCommentsQueryDto,
  ): Promise<TikTokCommentsListResponseDto> {
    return this.tikTok.listCommentsForOwner(
      this.requireOwnerId(req),
      videoId,
      query,
    );
  }

  private requireOwnerId(req: { user?: AuthUser }): number {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return ownerId;
  }
}
