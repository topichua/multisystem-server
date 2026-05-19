import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ProductStatus } from "../../database/entities/product-status.enum";

export class CatalogVariantProductDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  categoryId: number | null;

  @ApiPropertyOptional({ nullable: true })
  mainImageUrl: string | null;

  @ApiProperty()
  currency: string;

  @ApiProperty({ enum: ProductStatus })
  status: ProductStatus;

  @ApiPropertyOptional({ nullable: true })
  price: number | null;
}

export class CatalogVariantItemDto {
  @ApiProperty({ description: "Variant id (`variantId` for order line items)." })
  id: number;

  @ApiProperty()
  productId: number;

  @ApiPropertyOptional({ nullable: true })
  color: string | null;

  @ApiPropertyOptional({ nullable: true })
  size: string | null;

  @ApiPropertyOptional({ nullable: true })
  sku: string | null;

  @ApiProperty({
    description: "Variant price when set, otherwise parent product price.",
    nullable: true,
  })
  unitPrice: number | null;

  @ApiPropertyOptional({ nullable: true })
  imageUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  inStock: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  quantity: number | null;

  @ApiProperty({ enum: ProductStatus })
  status: ProductStatus;

  @ApiProperty({
    description: 'Display label, e.g. "Dress — black / M".',
  })
  label: string;

  @ApiProperty({ type: () => CatalogVariantProductDto })
  product: CatalogVariantProductDto;
}

export class CatalogVariantListResponseDto {
  @ApiProperty({ type: () => [CatalogVariantItemDto] })
  items: CatalogVariantItemDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;
}
