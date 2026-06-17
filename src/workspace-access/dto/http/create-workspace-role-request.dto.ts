import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateWorkspaceRoleRequestDto {
  @ApiProperty({ example: "sales-agent", description: "Unique per workspace" })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug must be lowercase alphanumeric with optional hyphens",
  })
  slug: string;

  @ApiProperty({ example: "Sales agent" })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Hex or CSS color." })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  color?: string | null;

  @ApiProperty({
    example: ["orders.read", "orders.create"],
    description: "Boolean keys from GET /permissions/catalog",
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissions: string[];

  @ApiPropertyOptional({
    example: { "orders.visibility": "mine" },
    description:
      "Option permissions from GET /permissions/catalog. " +
      "Per-integration conversation permissions use PUT .../integration-grants.",
  })
  @IsOptional()
  @IsObject()
  permissionOptions?: Record<string, string>;
}
