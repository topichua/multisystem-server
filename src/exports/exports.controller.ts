import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { WorkspaceExportStatusResponseDto } from "./dto/workspace-export-response.dto";
import { WorkspaceExportsService } from "./workspace-exports.service";

@ApiTags("exports")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("exports")
export class ExportsController {
  constructor(private readonly exports: WorkspaceExportsService) {}

  @Get(":id")
  @ApiOperation({
    summary: "Get export job status",
    description:
      "Poll async export status. When completed, `downloadUrl` is a temporary signed R2 URL.",
  })
  @ApiOkResponse({ type: WorkspaceExportStatusResponseDto })
  async getStatus(
    @Req() req: { user?: AuthUser },
    @Param("id") exportId: string,
  ): Promise<WorkspaceExportStatusResponseDto> {
    const ownerId = this.requireOwnerId(req);
    return this.exports.getStatusForOwner(ownerId, exportId);
  }

  @Get(":id/download")
  @ApiOperation({ summary: "Get signed download URL for a completed export" })
  async getDownload(
    @Req() req: { user?: AuthUser },
    @Param("id") exportId: string,
  ): Promise<{
    downloadUrl: string;
    fileName: string;
    expiresInSeconds: number;
  }> {
    const ownerId = this.requireOwnerId(req);
    return this.exports.getDownloadForOwner(ownerId, exportId);
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
