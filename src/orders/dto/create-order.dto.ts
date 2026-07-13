import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { OrderSource } from "../../database/entities/order-source.enum";
import { AddOrderItemDto } from "./add-order-item.dto";
import { CreateOrderCustomerNewDto } from "./create-order-customer-new.dto";
import { UpdateOrderDeliveryDto } from "./update-order-delivery.dto";

export class CreateOrderDto {
  @ApiPropertyOptional({
    description:
      "Existing client id in your workspace. Provide either `customerId` or `customerNew`, not both.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId?: number;

  @ApiPropertyOptional({
    type: () => CreateOrderCustomerNewDto,
    description:
      "Create a new client without social links (no Instagram/Telegram). Provide either `customerId` or `customerNew`, not both.",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateOrderCustomerNewDto)
  customerNew?: CreateOrderCustomerNewDto;

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
    minimum: 0,
    description: "Fixed discount amount applied to the whole order.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 100,
    description: "Percent discount applied to the whole order.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number;

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
