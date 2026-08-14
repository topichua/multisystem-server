import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";
import { WorkspaceTemplateType } from "../workspace-template-type.enum";

export class CreateWorkspaceTemplateDto {
  @ApiProperty({
    enum: WorkspaceTemplateType,
    example: WorkspaceTemplateType.chat,
    description: "`chat` — conversation message; `order` — order-related message.",
  })
  @IsEnum(WorkspaceTemplateType)
  type!: WorkspaceTemplateType;

  @ApiProperty({ description: "Template name", maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiProperty({
    description:
      "Template text. Use placeholders like `{client.name}` (see GET /workplace/templates/variables).",
  })
  @IsString()
  @IsNotEmpty()
  template!: string;

  @ApiPropertyOptional({
    description: "Defaults to true.",
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateWorkspaceTemplateDto {
  @ApiPropertyOptional({ enum: WorkspaceTemplateType })
  @IsOptional()
  @IsEnum(WorkspaceTemplateType)
  type?: WorkspaceTemplateType;

  @ApiPropertyOptional({ description: "Template name", maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: "Template text with `{variable}` placeholders.",
  })
  @IsOptional()
  @IsString()
  template?: string;

  @ApiPropertyOptional({
    description: "Set false to deactivate without deleting.",
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListWorkspaceTemplatesQueryDto {
  @ApiPropertyOptional({
    enum: WorkspaceTemplateType,
    description: "Filter by template type.",
  })
  @IsOptional()
  @IsEnum(WorkspaceTemplateType)
  type?: WorkspaceTemplateType;

  @ApiPropertyOptional({
    description: "Filter by active flag.",
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class RenderWorkspaceTemplateDto {
  @ApiPropertyOptional({
    description: "Required when template type is `order`.",
    example: 1001,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  orderId?: number;

  @ApiPropertyOptional({
    description: "Required when template type is `chat`.",
    example: 42,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  conversationId?: number;
}
