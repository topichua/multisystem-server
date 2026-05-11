import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { OrderSource } from "../../database/entities/order-source.enum";

export class CreateOrderDto {
  @ApiProperty({ description: "Client id in your workspace" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId: number;

  @ApiPropertyOptional({
    description:
      "Conversation id (must belong to a group in the same workspace). Omit for manual / non-DM orders.",
  })
  @IsOptional()
  @Type(() => Number)
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
}
