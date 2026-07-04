import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

export class NovaPoshtaOrderStatusMappingDto {
  @ApiPropertyOptional({
    description: "Order status id when delivery becomes CREATED (TTN issued).",
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  on_created_order_status_id?: number | null;

  @ApiPropertyOptional({
    description: "Order status id when delivery becomes IN_TRANSIT.",
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  on_in_transit_order_status_id?: number | null;

  @ApiPropertyOptional({
    description: "Order status id when delivery becomes ARRIVED (at branch).",
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  on_arrived_order_status_id?: number | null;

  @ApiPropertyOptional({
    description: "Order status id when delivery becomes DELIVERED.",
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  on_delivered_order_status_id?: number | null;

  @ApiPropertyOptional({
    description: "Order status id when delivery becomes RETURNED.",
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  on_returned_order_status_id?: number | null;

  @ApiPropertyOptional({
    description: "Order status id when delivery becomes DELIVERY_FAILED.",
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  on_delivery_failed_order_status_id?: number | null;
}

export class NovaPoshtaOrderStatusMappingResponseDto {
  @ApiPropertyOptional({ nullable: true })
  on_created_order_status_id: number | null;

  @ApiPropertyOptional({ nullable: true })
  on_in_transit_order_status_id: number | null;

  @ApiPropertyOptional({ nullable: true })
  on_arrived_order_status_id: number | null;

  @ApiPropertyOptional({ nullable: true })
  on_delivered_order_status_id: number | null;

  @ApiPropertyOptional({ nullable: true })
  on_returned_order_status_id: number | null;

  @ApiPropertyOptional({ nullable: true })
  on_delivery_failed_order_status_id: number | null;
}
