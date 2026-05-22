import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { OrderStatusCategory } from "../../database/entities/order-status-category.enum";

export class UpdateOrderStatusDefinitionDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: "Hex or CSS color; pass null or empty string to clear.",
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") {
      const t = value.trim();
      return t === "" ? null : t;
    }
    return value;
  })
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(32)
  color?: string | null;

  @ApiPropertyOptional({
    enum: OrderStatusCategory,
    description: "Only allowed for custom statuses (`isSystem: false`).",
  })
  @IsOptional()
  @IsEnum(OrderStatusCategory)
  category?: OrderStatusCategory;

  @ApiPropertyOptional({
    description:
      "When true, this status becomes the workspace default and any other default is cleared.",
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
