import { ApiProperty } from "@nestjs/swagger";
import { ProductListItemDto } from "../../products/dto/product-list-response.dto";

export class InstagramPostProductVariantsResponseDto {
  @ApiProperty({ description: "Instagram Graph media / post id." })
  postId: string;

  @ApiProperty({
    description: "Instagram Business Account id the references belong to.",
  })
  businessAccountId: string;

  @ApiProperty({
    type: () => [ProductListItemDto],
    description:
      "Referenced products with nested variants (same shape as GET /products items). " +
      "Only variants linked to this post are included; product-level references include all variants.",
  })
  items: ProductListItemDto[];
}
