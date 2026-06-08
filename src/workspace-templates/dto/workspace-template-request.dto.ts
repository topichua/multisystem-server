import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateWorkspaceTemplateDto {
  @ApiProperty({ description: "Template name", maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: "Template text or markup" })
  @IsString()
  @IsNotEmpty()
  template: string;
}

export class UpdateWorkspaceTemplateDto {
  @ApiProperty({
    description: "Template name",
    maxLength: 255,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({
    description: "Template text or markup",
    required: false,
  })
  @IsOptional()
  @IsString()
  template?: string;
}
