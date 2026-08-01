import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ClientResponseDto } from "./client-response.dto";

export class VariantWishlistEntryDto {
  @ApiProperty({ description: "`client_wishlist_items.id`" })
  id: number;

  @ApiProperty({
    description: "When the variant was added to this client's wishlist.",
  })
  at: Date;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Conversation used when the item was added (for the «Діалог» action).",
  })
  conversationId: number | null;

  @ApiProperty({ type: ClientResponseDto })
  client: ClientResponseDto;
}

export class VariantWishlistResponseDto {
  @ApiProperty()
  productId: number;

  @ApiProperty()
  variantId: number;

  @ApiProperty({
    description: "Number of clients waiting for this variant (`items.length`).",
  })
  total: number;

  @ApiProperty({ type: [VariantWishlistEntryDto] })
  items: VariantWishlistEntryDto[];
}
