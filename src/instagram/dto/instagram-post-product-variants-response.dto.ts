import { ApiProperty, OmitType } from "@nestjs/swagger";
import {
  ProductListItemDto,
  ProductListVariantDto,
} from "../../products/dto/product-list-response.dto";

export class InstagramPostProductVariantDto extends ProductListVariantDto {
  @ApiProperty({
    description:
      "`product_instagram_references.id` for this variant — use for DELETE on this post.",
  })
  referenceId: number;
}

export class InstagramPostProductItemDto extends OmitType(ProductListItemDto, [
  "variants",
] as const) {
  @ApiProperty({ type: () => [InstagramPostProductVariantDto] })
  variants: InstagramPostProductVariantDto[];
}

export class InstagramPostProductVariantsResponseDto {
  @ApiProperty({ description: "Instagram Graph media / post id." })
  postId: string;

  @ApiProperty({
    description: "Instagram Business Account id the references belong to.",
  })
  businessAccountId: string;

  @ApiProperty({ type: () => [InstagramPostProductItemDto] })
  items: InstagramPostProductItemDto[];
}
