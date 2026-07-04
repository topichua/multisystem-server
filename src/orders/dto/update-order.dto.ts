import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { AddOrderItemDto } from "./add-order-item.dto";

export class UpdateOrderDto {
  @ApiPropertyOptional({
    type: () => [AddOrderItemDto],
    description:
      "Replace all line items. Allowed only while order status category is `new`.",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddOrderItemDto)
  items?: AddOrderItemDto[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  customerNote?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  internalNote?: string | null;
}
