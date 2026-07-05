import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import {
  R2ConfigStatusResponseDto,
  R2PingResponseDto,
  R2UploadTestResponseDto,
} from "./dto/r2-storage-response.dto";
import { StorageService } from "./storage.service";

type UploadedTestFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
};

@ApiTags("storage")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("storage/r2")
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get("status")
  @ApiOperation({
    summary: "Check Cloudflare R2 configuration",
    description:
      "Returns which R2 environment variables are set (no secrets). " +
      "Use before upload to confirm CF_ACCOUNT_ID, keys, bucket, and public URL.",
  })
  @ApiOkResponse({ type: R2ConfigStatusResponseDto })
  getStatus(): R2ConfigStatusResponseDto {
    return this.storage.getR2ConfigStatus();
  }

  @Post("ping")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Upload a tiny JSON ping object to R2",
    description:
      "Verifies R2 credentials without sending a file. Returns a public URL you can open in a browser.",
  })
  @ApiCreatedResponse({ type: R2PingResponseDto })
  async ping(@Req() req: { user?: AuthUser }): Promise<R2PingResponseDto> {
    void req;
    return this.storage.pingR2();
  }

  @Post("upload-test")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Upload a file to R2 and return the public URL",
    description:
      "Test endpoint for CF_R2_* credentials. File is stored under upload-tests/ in your bucket.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
      required: ["file"],
    },
  })
  @ApiCreatedResponse({ type: R2UploadTestResponseDto })
  async uploadTest(
    @Req() req: { user?: AuthUser },
    @UploadedFile() file?: UploadedTestFile,
  ): Promise<R2UploadTestResponseDto> {
    void req;
    if (!file) {
      throw new BadRequestException(
        'Expected Content-Type: multipart/form-data with a file part named "file".',
      );
    }
    return this.storage.uploadR2TestFile(file);
  }
}
