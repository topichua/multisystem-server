import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ProductInstagramReferenceProductVariantPairDto {
  @ApiProperty()
  productId: number;

  @ApiPropertyOptional({
    description: "Null when the reference is for the whole product.",
  })
  productVariantId: number | null;

  @ApiProperty({
    description: "Instagram Graph media / post id this reference belongs to.",
  })
  postId: string;
}

export class ProductInstagramReferenceProductIdsResponseDto {
  @ApiProperty({
    description: "Instagram Business Account id the list was queried for.",
  })
  businessAccountId: string;

  @ApiProperty({
    type: () => [ProductInstagramReferenceProductVariantPairDto],
    description:
      "Product + variant + post links from references (no product rows loaded). " +
      "The same product/variant may appear multiple times when linked to different posts.",
  })
  pairs: ProductInstagramReferenceProductVariantPairDto[];
}
