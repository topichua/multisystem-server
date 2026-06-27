import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { NovaPoshtaApiKeyQueryDto } from "./novaposhta-api-key-query.dto";

export class SearchNovaPoshtaWarehousesQueryDto extends NovaPoshtaApiKeyQueryDto {
  @ApiProperty({
    description:
      "Settlement `ref` or delivery `cityRef` from settlement search. Both are accepted.",
    example: "00000000-0000-0000-0000-000000000000",
  })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() : String(value ?? "").trim(),
  )
  @IsString()
  @MinLength(1)
  @IsUUID("all")
  cityRef: string;

  @ApiPropertyOptional({
    description: "Optional warehouse search string.",
    example: "Сіцінського",
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === "") {
      return undefined;
    }
    const trimmed =
      typeof value === "string" ? value.trim() : String(value).trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  @MaxLength(100)
  query?: string;

  @ApiPropertyOptional({
    enum: ["all", "warehouse", "postomat"],
    default: "all",
    description: "Filter warehouses by category",
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === "") {
      return "all";
    }
    return typeof value === "string" ? value.trim().toLowerCase() : value;
  })
  @IsIn(["all", "warehouse", "postomat"])
  type?: "all" | "warehouse" | "postomat";
}
