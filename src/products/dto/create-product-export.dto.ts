import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type, Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { ProductStatus } from "../../database/entities/product-status.enum";
import { ProductListByStatus } from "./product-list-by-status.enum";
import { ProductListSort } from "./product-list-sort.enum";
import { ProductFieldFilterDto } from "./product-field-filter.dto";

export enum ProductExportScope {
  all = "all",
  filtered = "filtered",
  selected = "selected",
}

export enum ProductExportFormat {
  xlsx = "xlsx",
  csv = "csv",
}

/** Nested filters matching GET /products semantics (snapshot for the job). */
export class ProductExportFiltersDto {
  @ApiPropertyOptional({ description: "Alias for list `keyword`." })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  search?: string;

  @ApiPropertyOptional({ description: "Alias for list `keyword`." })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  keyword?: string;

  @ApiPropertyOptional({ enum: ProductListByStatus })
  @IsOptional()
  @IsEnum(ProductListByStatus)
  byStatus?: ProductListByStatus;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  categoryIds?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceFrom?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceTo?: number;

  @ApiPropertyOptional({ description: "Alias for priceFrom." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: "Alias for priceTo." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantityFrom?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantityTo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  wishlistOnly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showOnlyReserved?: boolean;

  @ApiPropertyOptional({ type: [ProductFieldFilterDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductFieldFilterDto)
  fieldFilters?: ProductFieldFilterDto[];
}

export class ProductExportSortDto {
  @ApiPropertyOptional({
    enum: ["createdAt", "name", "price", "created_at"],
  })
  @IsOptional()
  @IsString()
  field?: string;

  @ApiPropertyOptional({ enum: ["asc", "desc"] })
  @IsOptional()
  @IsIn(["asc", "desc"])
  direction?: "asc" | "desc";
}

export class CreateProductExportDto {
  @ApiProperty({ enum: ProductExportScope })
  @IsEnum(ProductExportScope)
  scope!: ProductExportScope;

  @ApiProperty({ enum: ProductExportFormat })
  @IsEnum(ProductExportFormat)
  format!: ProductExportFormat;

  @ApiPropertyOptional({ type: ProductExportFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductExportFiltersDto)
  filters?: ProductExportFiltersDto;

  @ApiPropertyOptional({
    description:
      "List sort enum (`created_desc`, …) or nested `{ field, direction }`.",
    oneOf: [
      { type: "string", enum: Object.values(ProductListSort) },
      { type: "object" },
    ],
  })
  @IsOptional()
  sort?: ProductListSort | ProductExportSortDto | string;

  @ApiPropertyOptional({
    type: [Number],
    description: "Required when scope=selected. Must belong to workspace.",
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (!Array.isArray(value)) return value;
    return value.map((v) =>
      typeof v === "string" || typeof v === "number" ? Number(v) : v,
    );
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50_000)
  @IsInt({ each: true })
  @Min(1, { each: true })
  productIds?: number[];
}

export class CreateProductExportResponseDto {
  @ApiProperty({ example: "exp_abc123" })
  id: string;

  @ApiProperty({ example: "pending" })
  status: string;
}

export class ProductExportStatusResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({
    enum: ["pending", "processing", "completed", "failed", "expired"],
  })
  status: string;

  @ApiPropertyOptional({ nullable: true })
  fileName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  fileSize?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Temporary signed URL when status=completed.",
  })
  downloadUrl?: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ nullable: true })
  completedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  expiresAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  errorMessage?: string | null;
}
