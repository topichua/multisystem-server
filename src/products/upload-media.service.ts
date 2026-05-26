import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { ProductMedia, UploadMedia } from "../database/entities";
import { CloudflareImagesService } from "./cloudflare-images.service";
import type { UploadMediaResponseDto } from "./dto/upload-media-response.dto";

type UploadedImageFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
};

@Injectable()
export class UploadMediaService {
  constructor(
    @InjectRepository(UploadMedia)
    private readonly uploadMediaRepo: Repository<UploadMedia>,
    @InjectRepository(ProductMedia)
    private readonly productMediaRepo: Repository<ProductMedia>,
    private readonly cloudflareImages: CloudflareImagesService,
  ) {}

  async uploadForWorkspace(
    workspaceId: number,
    userId: number,
    file: UploadedImageFile,
  ): Promise<UploadMediaResponseDto> {
    const uploaded = await this.cloudflareImages.uploadImage(file);
    const row = await this.uploadMediaRepo.save(
      this.uploadMediaRepo.create({
        workspaceId,
        cdnUrl: uploaded.cdnUrl,
        cloudflareImageId: uploaded.cloudflareImageId,
        createdByUserId: userId,
      }),
    );
    return this.toDto(row);
  }

  async deleteForWorkspace(
    workspaceId: number,
    uploadMediaId: number,
  ): Promise<void> {
    const row = await this.uploadMediaRepo.findOne({
      where: { id: uploadMediaId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException("Upload media not found");
    }

    const inUse = await this.productMediaRepo.exist({
      where: { uploadMediaId: row.id },
    });
    if (inUse) {
      throw new ConflictException(
        "Upload media is attached to a product; remove it from the product first",
      );
    }

    if (row.cloudflareImageId) {
      await this.cloudflareImages.deleteImage(row.cloudflareImageId);
    }
    await this.uploadMediaRepo.remove(row);
  }

  async requireForWorkspace(
    workspaceId: number,
    ids: number[],
  ): Promise<Map<number, UploadMedia>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return new Map();
    }
    const rows = await this.uploadMediaRepo.find({
      where: { workspaceId, id: In(unique) },
    });
    if (rows.length !== unique.length) {
      const found = new Set(rows.map((r) => r.id));
      const missing = unique.filter((id) => !found.has(id));
      throw new BadRequestException(
        `Unknown or inaccessible upload media id(s): ${missing.join(", ")}`,
      );
    }
    return new Map(rows.map((r) => [r.id, r]));
  }

  private toDto(row: UploadMedia): UploadMediaResponseDto {
    return {
      id: row.id,
      cdnUrl: row.cdnUrl,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
