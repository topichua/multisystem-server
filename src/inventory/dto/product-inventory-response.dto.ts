import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ProductInventoryVariantDto {
  @ApiProperty()
  variantId: number;

  @ApiPropertyOptional({ nullable: true })
  sku: string | null;

  @ApiPropertyOptional({ nullable: true })
  name: string | null;

  @ApiPropertyOptional({ nullable: true })
  price: number | null;

  @ApiProperty({ description: "Physical stock quantity." })
  quantity: number;

  @ApiProperty()
  reservedQuantity: number;

  @ApiProperty({ description: "quantity - reservedQuantity" })
  availableQuantity: number;

  /** @deprecated Use `quantity` */
  @ApiProperty()
  stockQty: number;

  @ApiProperty()
  stockCostTotal: number;

  @ApiPropertyOptional({ nullable: true })
  averagePurchasePrice: number | null;
}

export class ProductInventoryResponseDto {
  @ApiProperty()
  productId: number;

  @ApiProperty({ type: [ProductInventoryVariantDto] })
  variants: ProductInventoryVariantDto[];
}
