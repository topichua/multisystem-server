import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { OrderSource } from "../../database/entities/order-source.enum";
import { AddOrderItemDto } from "./add-order-item.dto";
import { UpdateOrderDeliveryDto } from "./update-order-delivery.dto";

export class CreateOrderDto {
  @ApiProperty({ description: "Client id in your workspace" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId: number;

  @ApiPropertyOptional({
    description:
      "Conversation id (must belong to a group in the same workspace). Omit, null, or empty string for manual / non-DM orders.",
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === null || value === undefined || value === "") {
      return undefined;
    }
    if (typeof value === "number") {
      return Number.isInteger(value) && value >= 1 ? value : undefined;
    }
    if (typeof value === "string") {
      const t = value.trim();
      if (t === "") return undefined;
      const n = Number.parseInt(t, 10);
      return Number.isInteger(n) && n >= 1 ? n : undefined;
    }
    return undefined;
  })
  @IsInt()
  @Min(1)
  conversationId?: number;

  @ApiPropertyOptional({ enum: OrderSource })
  @IsOptional()
  @IsEnum(OrderSource)
  source?: OrderSource;

  @ApiPropertyOptional({ maxLength: 8 })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalNote?: string;

  @ApiPropertyOptional({
    type: () => [AddOrderItemDto],
    description:
      "Line items to add on create (same shape as POST /orders/:orderId/items). Omit or `[]` for an empty order.",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddOrderItemDto)
  items?: AddOrderItemDto[];

  @ApiPropertyOptional({
    type: () => UpdateOrderDeliveryDto,
    description:
      "Delivery details to set on create (same shape as PATCH /orders/:orderId/delivery).",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateOrderDeliveryDto)
  delivery?: UpdateOrderDeliveryDto;
}
