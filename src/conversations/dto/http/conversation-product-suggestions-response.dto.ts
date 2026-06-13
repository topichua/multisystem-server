import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

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

export class ConversationProductSuggestionsResponseDto {
  @ApiProperty({ type: [ProductSuggestionItemDto] })
  items: ProductSuggestionItemDto[];
}
