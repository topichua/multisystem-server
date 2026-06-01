import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ProductStatus } from "../../database/entities/product-status.enum";
import { ProductType } from "../../database/entities/product-type.enum";
import { VariantCustomFieldType } from "../../database/entities/variant-custom-field-type.enum";

export class ProductListVariantCustomFieldDto {
  @ApiProperty()
  fieldId: number;

  @ApiProperty()
  key: string;

  @ApiProperty()
  label: string;

  @ApiProperty({ enum: VariantCustomFieldType })
  type: VariantCustomFieldType;

  @ApiProperty()
  value: string;

  @ApiProperty({ description: "Display order among variant custom fields." })
  order: number;
}

export class ProductListMediaDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  productId: number;

  @ApiPropertyOptional({ nullable: true })
  variantId: number | null;

  @ApiPropertyOptional({ nullable: true })
  uploadMediaId: number | null;

  @ApiProperty()
  url: string;

  @ApiProperty()
  type: string;

  @ApiPropertyOptional({ nullable: true })
  sourceUrl: string | null;

  @ApiProperty()
  sortOrder: number;
}

export class ProductListVariantDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ type: [ProductListVariantCustomFieldDto] })
  customFields: ProductListVariantCustomFieldDto[];

  @ApiPropertyOptional({ nullable: true })
  price: number | null;

  @ApiPropertyOptional({ nullable: true })
  inStock: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  quantity: number | null;

  @ApiPropertyOptional({ nullable: true })
  imageUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  sku: string | null;

  @ApiProperty({ enum: ProductStatus })
  status: ProductStatus;

  @ApiProperty({ type: [ProductListMediaDto] })
  media: ProductListMediaDto[];
}

export class ProductListItemDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: ProductType })
  productType: ProductType;

  @ApiProperty({ enum: ProductStatus })
  status: ProductStatus;

  @ApiPropertyOptional({ nullable: true })
  price: number | null;

  @ApiProperty()
  currency: string;

  @ApiPropertyOptional({ nullable: true })
  inStock: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  quantity: number | null;

  @ApiPropertyOptional({ nullable: true })
  mainImageUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  categoryId: number | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: [ProductListVariantDto] })
  variants: ProductListVariantDto[];
}

export class ProductListResponseDto {
  @ApiProperty({ type: [ProductListItemDto] })
  items: ProductListItemDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  offset: number;
}
