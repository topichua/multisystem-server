import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { CategoriesService } from "../categories/categories.service";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { VariantCustomFieldsService } from "../variant-custom-fields/variant-custom-fields.service";
import type { InstagramPostAiExtractionResponseDto } from "./dto/instagram-post-ai-extraction-response.dto";
import {
  collectCategoryIds,
  flattenCategoriesForPrompt,
} from "./instagram-category-prompt.util";
import {
  emptyInstagramPostAiExtractionFallback,
  validateAndNormalizeInstagramPostAiExtraction,
} from "./instagram-post-ai-extraction.validate";
import {
  buildOpenAiVisionImageParts,
  extractInstagramPostMedia,
} from "./instagram-post-media.util";
import { InstagramService } from "./instagram.service";
import {
  INSTAGRAM_POST_AI_EXTRACTION_SYSTEM_PROMPT,
  buildInstagramPostAiExtractionUserText,
} from "./prompts/instagram-post-ai-extraction.prompt";

const MAX_VISION_IMAGES = 8;

@Injectable()
export class InstagramPostAiExtractionService {
  constructor(
    private readonly config: ConfigService,
    private readonly instagram: InstagramService,
    private readonly categories: CategoriesService,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly variantCustomFields: VariantCustomFieldsService,
  ) {}

  async extractPostForProductForm(
    ownerId: number,
    instagramPostId: string,
    integrationId: number,
  ): Promise<InstagramPostAiExtractionResponseDto> {
    const postId = instagramPostId.trim();
    if (!postId) {
      throw new BadRequestException("instagramPostId is required");
    }

    const { detail, accessToken } = await this.instagram.fetchMediaByIdForOwner(
      ownerId,
      postId,
      integrationId,
    );

    const media = extractInstagramPostMedia(detail, postId);
    const fallback = () => emptyInstagramPostAiExtractionFallback(postId, media);

    const categoryTree = await this.categories.findTreeForOwner(ownerId);
    const allowedCategoryIds = collectCategoryIds(categoryTree);

    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const customFields =
      await this.variantCustomFields.listDefinitionsForWorkspace(
        workspace.id,
      );

    const apiKey = this.config.get<string>("OPENAI_API_KEY")?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        "OPENAI_API_KEY is not configured; set it to use product extraction.",
      );
    }

    const imageParts = await buildOpenAiVisionImageParts(
      media,
      (url) => this.instagram.downloadMediaBinary(accessToken, url),
      MAX_VISION_IMAGES,
    );

    const userText = buildInstagramPostAiExtractionUserText({
      instagramPostId: postId,
      caption: detail.caption ?? null,
      mediaType: detail.media_type ?? null,
      permalink: detail.permalink ?? null,
      categories: flattenCategoriesForPrompt(categoryTree),
      media: media.map((m) => ({ mediaId: m.mediaId, type: m.type })),
    });

    if (imageParts.length === 0 && !detail.caption?.trim()) {
      return fallback();
    }

    const raw = await this.requestOpenAiJson(apiKey, userText, imageParts);
    if (!raw) {
      return fallback();
    }

    return validateAndNormalizeInstagramPostAiExtraction({
      sourceInstagramPostId: postId,
      media,
      raw,
      allowedCategoryIds,
      customFields,
    });
  }

  private async requestOpenAiJson(
    apiKey: string,
    userText: string,
    imageParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
  ): Promise<unknown | null> {
    const model =
      this.config.get<string>("OPENAI_PRODUCT_VISION_MODEL")?.trim() ||
      "gpt-4.1-nano";

    const client = new OpenAI({ apiKey });

    try {
      const completion = await client.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: INSTAGRAM_POST_AI_EXTRACTION_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: [{ type: "text", text: userText }, ...imageParts],
          },
        ],
        max_completion_tokens: 2000,
      });

      const content = completion.choices[0]?.message?.content?.trim();
      if (!content) return null;

      return JSON.parse(content) as unknown;
    } catch (e) {
      if (e instanceof SyntaxError) {
        return null;
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadGatewayException(`OpenAI request failed: ${msg}`);
    }
  }
}
