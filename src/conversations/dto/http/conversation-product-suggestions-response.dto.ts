import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { InstagramPostProductItemDto } from "../../../instagram/dto/instagram-post-product-variants-response.dto";

export class ProductSuggestionItemDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  productId: number;

  @ApiPropertyOptional({ nullable: true })
  productVariantId: number | null;

  @ApiProperty()
  conversationId: number;

  @ApiPropertyOptional({ nullable: true })
  postId: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: Date;
}

/** Same grouped product/variant shape as GET /api/instagram/posts/:id/product-variants. */
export class ConversationProductSuggestionsResponseDto {
  @ApiProperty()
  conversationId: number;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Instagram post id when all suggestions share one post; otherwise null.",
  })
  postId: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Conversation external source id (e.g. Instagram business account).",
  })
  businessAccountId: string | null;

  @ApiProperty({ type: () => [InstagramPostProductItemDto] })
  items: InstagramPostProductItemDto[];
}
