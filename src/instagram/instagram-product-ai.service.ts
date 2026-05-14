import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import type { CategoryTreeNodeDto } from "../categories/categories.service";
import { CategoriesService } from "../categories/categories.service";
import { ProductSourceType } from "../database/entities/product-source-type.enum";
import {
  expandVariantColorSize,
  mergeAnalysisDescription,
  tryParsePriceFromOfferText,
} from "../products/instagram-analysis-draft.util";
import { ProductsService } from "../products/products.service";
import type {
  AnalyzedCategoryDto,
  AnalyzedProductDto,
  AnalyzeInstagramProductResponseDto,
  InstagramAnalyzeProductPreviewDto,
} from "./dto/analyze-instagram-product.dto";
import {
  InstagramService,
  type InstagramGraphMediaDetail,
} from "./instagram.service";
import {
  PRODUCT_FROM_INSTAGRAM_SYSTEM_PROMPT,
  buildProductFromInstagramUserText,
} from "./prompts/product-from-instagram-media.prompt";

function pickVisualAssetUrl(detail: InstagramGraphMediaDetail): string | null {
  const type = detail.media_type?.toUpperCase() ?? "";
  if (type === "VIDEO") {
    return detail.thumbnail_url?.trim() || null;
  }
  if (type === "CAROUSEL_ALBUM") {
    const kids = detail.children?.data ?? [];
    for (const c of kids) {
      const mt = c.media_type?.toUpperCase() ?? "";
      const url = c.media_url?.trim() || c.thumbnail_url?.trim();
      if (url && mt === "IMAGE") return url;
    }
    const first = kids[0];
    return first?.media_url?.trim() || first?.thumbnail_url?.trim() || null;
  }
  return detail.media_url?.trim() || detail.thumbnail_url?.trim() || null;
}

function collectInstagramImageLinks(
  detail: InstagramGraphMediaDetail,
): string[] {
  const out: string[] = [];
  const push = (u: string | undefined | null) => {
    const t = u?.trim();
    if (t && !out.includes(t)) out.push(t);
  };

  push(detail.permalink);
  const sc = detail.shortcode?.trim();
  if (sc && !detail.permalink?.trim()) {
    push(`https://www.instagram.com/p/${sc}/`);
  }

  const type = detail.media_type?.toUpperCase() ?? "";
  if (type === "CAROUSEL_ALBUM") {
    for (const c of detail.children?.data ?? []) {
      const mt = c.media_type?.toUpperCase() ?? "";
      if (mt === "VIDEO") {
        push(c.thumbnail_url);
      } else {
        push(c.media_url);
      }
    }
  } else {
    push(detail.media_url);
    if (type === "VIDEO") {
      push(detail.thumbnail_url);
    }
  }
  return out;
}

function formatCategoryCatalogLines(nodes: CategoryTreeNodeDto[]): string {
  const lines: string[] = [];
  const walk = (n: CategoryTreeNodeDto, parentPath: string) => {
    const path = parentPath ? `${parentPath} > ${n.name}` : n.name;
    lines.push(`id ${n.id}: ${path}`);
    n.children?.forEach((c) => walk(c, path));
  };
  nodes.forEach((n) => walk(n, ""));
  return lines.join("\n");
}

function collectCategoryIds(nodes: CategoryTreeNodeDto[]): Set<number> {
  const s = new Set<number>();
  const walk = (n: CategoryTreeNodeDto) => {
    s.add(n.id);
    n.children?.forEach(walk);
  };
  nodes.forEach(walk);
  return s;
}

function asNonEmptyString(v: unknown, fallback: string): string {
  if (typeof v === "string" && v.trim()) return v.trim();
  return fallback;
}

function asStringRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string" && val.trim()) out[k] = val.trim();
  }
  return out;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

@Injectable()
export class InstagramProductAiService {
  constructor(
    private readonly config: ConfigService,
    private readonly instagram: InstagramService,
    private readonly categories: CategoriesService,
    private readonly products: ProductsService,
  ) {}

  /**
   * Vision + OpenAI analysis only — no catalog writes. Same model input as
   * {@link analyzeProductFromMedia}.
   */
  async analyzeProductPreviewFromMedia(
    ownerId: number,
    instagramMediaId: string,
  ): Promise<InstagramAnalyzeProductPreviewDto> {
    const { parsed, detail } = await this.runOpenAiProductAnalysis(
      ownerId,
      instagramMediaId,
    );
    const description =
      mergeAnalysisDescription(
        parsed.product.shortDescription,
        parsed.product.longDescription,
      ) ?? "";
    const images = collectInstagramImageLinks(detail);
    const variantRows = expandVariantColorSize(
      parsed.product.colors,
      parsed.product.sizes,
    );
    const variants = variantRows.map((v) => ({
      color: v.color ?? "",
      size: v.size ?? "",
    }));
    return {
      name: parsed.product.name,
      description,
      price: tryParsePriceFromOfferText(parsed.product.visiblePriceOrOffer),
      images,
      matchedCategory: parsed.category.matchedCategoryPath ?? null,
      variants,
      brandOrLabel: parsed.product.brandOrLabel ?? "",
    };
  }

  async analyzeProductFromMedia(
    ownerId: number,
    instagramMediaId: string,
  ): Promise<AnalyzeInstagramProductResponseDto> {
    const { parsed, detail, assetUrl } = await this.runOpenAiProductAnalysis(
      ownerId,
      instagramMediaId,
    );

    const savedProduct = await this.products.createDraftFromInstagramAnalysis(
      ownerId,
      {
        instagramMediaId,
        mainImageUrl: assetUrl,
        sourceType: ProductSourceType.instagram_post,
        permalink: detail.permalink?.trim() ?? null,
        caption: detail.caption?.trim() ?? null,
        name: parsed.product.name,
        shortDescription: parsed.product.shortDescription,
        longDescription: parsed.product.longDescription,
        colors: parsed.product.colors,
        sizes: parsed.product.sizes,
        visiblePriceOrOffer: parsed.product.visiblePriceOrOffer,
        matchedCategoryId: parsed.category.matchedCategoryId,
      },
    );

    return {
      instagramMediaId,
      product: parsed.product,
      category: parsed.category,
      catalogProductId: savedProduct.id,
      savedProduct,
    };
  }

  private async runOpenAiProductAnalysis(
    ownerId: number,
    instagramMediaId: string,
  ): Promise<{
    parsed: { product: AnalyzedProductDto; category: AnalyzedCategoryDto };
    detail: InstagramGraphMediaDetail;
    assetUrl: string;
  }> {
    const apiKey = this.config.get<string>("OPENAI_API_KEY")?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        "OPENAI_API_KEY is not configured; set it to use product analysis.",
      );
    }

    const { detail, accessToken } = await this.instagram.fetchMediaByIdForOwner(
      ownerId,
      instagramMediaId,
    );

    const assetUrl = pickVisualAssetUrl(detail);
    if (!assetUrl) {
      throw new BadRequestException(
        "This media has no image URL or thumbnail suitable for vision (e.g. some video/reel types).",
      );
    }

    const { buffer, contentType } = await this.instagram.downloadMediaBinary(
      accessToken,
      assetUrl,
    );
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${contentType};base64,${base64}`;

    const tree = await this.categories.findTreeForOwner(ownerId);
    const allowedIds = collectCategoryIds(tree);
    const catalogText = formatCategoryCatalogLines(tree);

    const userText = buildProductFromInstagramUserText({
      caption: detail.caption ?? null,
      mediaType: detail.media_type ?? null,
      permalink: detail.permalink ?? null,
      instagramMediaId,
      categoryCatalogLines: catalogText,
    });

    const model =
      this.config.get<string>("OPENAI_PRODUCT_VISION_MODEL")?.trim() ||
      "gpt-4.1-nano";

    const client = new OpenAI({ apiKey });

    let content: string | null = null;
    try {
      const completion = await client.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: PRODUCT_FROM_INSTAGRAM_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        max_completion_tokens: 1400,
      });
      content = completion.choices[0]?.message?.content?.trim() ?? null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadGatewayException(`OpenAI request failed: ${msg}`);
    }

    if (!content) {
      throw new BadGatewayException("OpenAI returned an empty response");
    }

    let raw: unknown;
    try {
      raw = JSON.parse(content) as unknown;
    } catch {
      throw new BadGatewayException("OpenAI returned invalid JSON");
    }

    const parsed = this.normalizeAnalysis(raw, allowedIds);
    return { parsed, detail, assetUrl };
  }

  private normalizeAnalysis(
    raw: unknown,
    allowedIds: Set<number>,
  ): { product: AnalyzedProductDto; category: AnalyzedCategoryDto } {
    const root =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const p =
      root.product && typeof root.product === "object" ? root.product : {};
    const pr = p as Record<string, unknown>;
    const c =
      root.category && typeof root.category === "object" ? root.category : {};
    const cr = c as Record<string, unknown>;

    let matchedId: number | null =
      typeof cr.matchedCategoryId === "number" &&
      Number.isInteger(cr.matchedCategoryId)
        ? cr.matchedCategoryId
        : null;
    if (matchedId !== null && !allowedIds.has(matchedId)) {
      matchedId = null;
    }

    const product: AnalyzedProductDto = {
      name: asNonEmptyString(pr.name, "Товар без назви"),
      shortDescription: asNonEmptyString(pr.shortDescription, ""),
      longDescription: asNonEmptyString(pr.longDescription, ""),
      colors: asStringArray(pr.colors),
      sizes: asStringArray(pr.sizes),
      keywords: asStringArray(pr.keywords),
      attributes: asStringRecord(pr.attributes),
      visiblePriceOrOffer:
        typeof pr.visiblePriceOrOffer === "string" &&
        pr.visiblePriceOrOffer.trim()
          ? pr.visiblePriceOrOffer.trim()
          : null,
      brandOrLabel:
        typeof pr.brandOrLabel === "string" && pr.brandOrLabel.trim()
          ? pr.brandOrLabel.trim()
          : null,
    };

    const category: AnalyzedCategoryDto = {
      matchedCategoryId: matchedId,
      matchedCategoryPath:
        typeof cr.matchedCategoryPath === "string" &&
        cr.matchedCategoryPath.trim()
          ? cr.matchedCategoryPath.trim()
          : null,
      reason: asNonEmptyString(cr.reason, ""),
    };

    return { product, category };
  }
}
