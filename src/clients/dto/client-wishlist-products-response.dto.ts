import { ApiProperty } from "@nestjs/swagger";
import { InstagramPostProductItemDto } from "../../instagram/dto/instagram-post-product-variants-response.dto";

/** Grouped wishlist products — same item shape as conversation product suggestions. */
export class ClientWishlistProductsResponseDto {
  @ApiProperty()
  clientId: number;

  @ApiProperty({ type: () => [InstagramPostProductItemDto] })
  items: InstagramPostProductItemDto[];
}
