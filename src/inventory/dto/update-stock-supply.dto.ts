import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { CreateStockSupplyItemDto } from "./create-stock-supply.dto";

export class UpdateStockSupplyDto {
  @ApiPropertyOptional({
    description: "Display name of the supply batch.",
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ type: [CreateStockSupplyItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStockSupplyItemDto)
  items?: CreateStockSupplyItemDto[];

  @ApiPropertyOptional({
    description: "Pass null to clear the comment.",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  comment?: string | null;
}
