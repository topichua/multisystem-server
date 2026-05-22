import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
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

export class CreateOrderStatusDefinitionDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiProperty({ enum: OrderStatusCategory })
  @IsEnum(OrderStatusCategory)
  category: OrderStatusCategory;

  @ApiPropertyOptional({
    nullable: true,
    description: "Hex or CSS color.",
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === null || value === undefined) return undefined;
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
    description:
      "When true, becomes workspace default (clears default on other statuses).",
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
