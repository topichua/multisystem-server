import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  IsArray,
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

  @ApiProperty({
    example: ["conversations.read", "conversations.write"],
    description: "Keys from GET /permissions/catalog",
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissions: string[];
}
