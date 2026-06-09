import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ProductInstagramReferenceDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  workspaceId: number;

  @ApiProperty({
    description: "Instagram Business Account id (Graph `instagram_business_account.id`).",
  })
  businessAccountId: string;

  @ApiProperty()
  productId: number;

  @ApiPropertyOptional()
  productVariantId: number | null;

  @ApiPropertyOptional()
  permalink: string | null;

  @ApiProperty()
  postId: string;

  @ApiProperty()
  createdById: number;

  @ApiProperty()
  createdAt: Date;
}

export class ProductInstagramReferenceListResponseDto {
  @ApiProperty({ type: () => [ProductInstagramReferenceDto] })
  data: ProductInstagramReferenceDto[];
}
