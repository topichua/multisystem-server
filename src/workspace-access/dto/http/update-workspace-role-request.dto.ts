import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateWorkspaceRoleRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissions?: string[];

  @ApiPropertyOptional({
    example: { "orders.visibility": "all" },
    description: "Option permissions from GET /permissions/catalog.",
  })
  @IsOptional()
  @IsObject()
  permissionOptions?: Record<string, string>;

  @ApiPropertyOptional({
    example: { "conversations.sources": ["instagram", "telegram"] },
  })
  @IsOptional()
  @IsObject()
  permissionOptionLists?: Record<string, string[]>;
}
