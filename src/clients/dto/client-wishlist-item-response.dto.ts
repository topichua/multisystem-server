import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ClientWishlistItemResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  productId: number;

  @ApiProperty()
  variantId: number;

  @ApiProperty()
  at: Date;

  @ApiProperty()
  createdBy: number;

  @ApiPropertyOptional({ nullable: true })
  conversationId: number | null;
}
