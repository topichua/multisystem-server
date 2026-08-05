import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from "class-validator";

export class ListChatAutoDistributionLogQueryDto {
  @ApiPropertyOptional({
    enum: ["instagram", "telegram"],
    description: "Filter by channel type.",
  })
  @IsOptional()
  @IsIn(["instagram", "telegram"])
  integrationType?: "instagram" | "telegram";

  @ApiPropertyOptional({
    description: "Filter by channel integration id.",
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  integrationId?: number;

  @ApiPropertyOptional({
    description: "Filter by assigned workspace member id.",
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  memberId?: number;

  @ApiPropertyOptional({
    description: "Inclusive range start (ISO date or datetime).",
    example: "2026-08-01",
  })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({
    description: "Inclusive range end (ISO date or datetime).",
    example: "2026-08-31",
  })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
