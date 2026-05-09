import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";

type CloudflareImagesUploadResponse = {
  success?: boolean;
  errors?: Array<{ message?: string }>;
  result?: {
    id?: string;
    variants?: string[];
  };
};

type UploadedImageFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
};

@Injectable()
export class CloudflareImagesService {
  private readonly accountId = process.env.CF_ACCOUNT_ID?.trim();
  private readonly apiToken = process.env.CF_API_KEY?.trim();

  async uploadImage(file: UploadedImageFile): Promise<string> {
    if (!this.accountId || !this.apiToken) {
      throw new ServiceUnavailableException(
        "Cloudflare image upload is not configured (CF_ACCOUNT_ID / CF_API_KEY).",
      );
    }

    if (!file?.buffer?.length) {
      throw new BadRequestException("Image file is required.");
    }

    if (!file.mimetype?.startsWith("image/")) {
      throw new BadRequestException("Only image files are allowed.");
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/images/v1`;
    const form = new FormData();
    const bytes = new Uint8Array(file.buffer);
    const blob = new Blob([bytes], {
      type: file.mimetype || "application/octet-stream",
    });
    form.append("file", blob, file.originalname || "product-main-image");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: form,
    });

    let payload: CloudflareImagesUploadResponse = {};
    try {
      payload = (await response.json()) as CloudflareImagesUploadResponse;
    } catch {
      throw new BadGatewayException(
        "Cloudflare Images returned invalid JSON response.",
      );
    }

    if (!response.ok || payload.success !== true) {
      const apiMessage =
        payload.errors
          ?.map((e) => e.message)
          .filter(Boolean)
          .join("; ") || `HTTP ${response.status}`;
      throw new BadGatewayException(
        `Cloudflare image upload failed: ${apiMessage}`,
      );
    }

    const deliveryUrl = payload.result?.variants?.[0]?.trim();
    if (!deliveryUrl) {
      throw new BadGatewayException(
        "Cloudflare upload succeeded but no delivery URL was returned.",
      );
    }

    return deliveryUrl;
  }

  /** Backward-compatible alias for existing product create flow. */
  async uploadProductMainImage(file: UploadedImageFile): Promise<string> {
    return this.uploadImage(file);
  }
}
