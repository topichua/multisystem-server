import { ApiProperty } from "@nestjs/swagger";
import { ProductListItemDto } from "../../products/dto/product-list-response.dto";

export class InstagramPostProductReferenceItemDto {
  @ApiProperty({
    description: "`product_instagram_references.id` — use for DELETE on this post.",
  })
  referenceId: number;

  @ApiProperty({
    type: () => ProductListItemDto,
    description:
      "Product with nested variants (same shape as GET /products items). " +
      "Variant-specific references include only that variant; product-level references include all variants.",
  })
  product: ProductListItemDto;
}

export class InstagramPostProductVariantsResponseDto {
  @ApiProperty({ description: "Instagram Graph media / post id." })
  postId: string;

  @ApiProperty({
    description: "Instagram Business Account id the references belong to.",
  })
  businessAccountId: string;

  @ApiProperty({ type: () => [InstagramPostProductReferenceItemDto] })
  items: InstagramPostProductReferenceItemDto[];
}
