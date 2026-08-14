import { ApiProperty } from "@nestjs/swagger";
import { WorkspaceTemplateType } from "../workspace-template-type.enum";

export class WorkspaceTemplateResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  workspaceId!: number;

  @ApiProperty({ enum: WorkspaceTemplateType })
  type!: WorkspaceTemplateType;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    description: "Raw template with `{placeholders}`.",
  })
  template!: string;

  @ApiProperty({
    description: "Whether the template is available for use in the UI and automations.",
  })
  isActive!: boolean;

  @ApiProperty()
  createdById!: number;

  @ApiProperty({ nullable: true })
  updatedById!: number | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class WorkspaceTemplateVariableDto {
  @ApiProperty({
    example: "client.name",
    description: "Stable key for client-side localization.",
  })
  key!: string;

  @ApiProperty({
    example: "{client.name}",
    description: "Token to insert into template text.",
  })
  placeholder!: string;
}

export class WorkspaceTemplateVariablesTypeDto {
  @ApiProperty({ enum: WorkspaceTemplateType })
  type!: WorkspaceTemplateType;

  @ApiProperty({ type: [WorkspaceTemplateVariableDto] })
  variables!: WorkspaceTemplateVariableDto[];
}

export class WorkspaceTemplateVariablesResponseDto {
  @ApiProperty({ type: [WorkspaceTemplateVariablesTypeDto] })
  types!: WorkspaceTemplateVariablesTypeDto[];
}

export class WorkspaceTemplateRenderResponseDto {
  @ApiProperty()
  templateId!: number;

  @ApiProperty({ enum: WorkspaceTemplateType })
  type!: WorkspaceTemplateType;

  @ApiProperty({
    description: "Rendered text after placeholder substitution.",
  })
  text!: string;

  @ApiProperty({
    description: "Resolved variable values used for substitution (key → value).",
    example: { "client.name": "Ivan", "client.lastName": "Petrenko" },
  })
  variables!: Record<string, string>;
}
