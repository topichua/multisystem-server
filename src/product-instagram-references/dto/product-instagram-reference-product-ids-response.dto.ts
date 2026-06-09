import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ProductInstagramReferenceProductVariantPairDto {
  @ApiProperty()
  productId: number;

  @ApiPropertyOptional({
    description: "Null when the reference is for the whole product.",
  })
  productVariantId: number | null;
}

export class ProductInstagramReferenceProductIdsResponseDto {
  @ApiProperty({
    description: "Instagram Business Account id the list was queried for.",
  })
  businessAccountId: string;

  @ApiProperty({
    type: () => [ProductInstagramReferenceProductVariantPairDto],
    description:
      "Distinct productId + productVariantId pairs from references (no product rows loaded).",
  })
  pairs: ProductInstagramReferenceProductVariantPairDto[];
}
