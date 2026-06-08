import { ApiProperty } from "@nestjs/swagger";

export class WorkspaceTemplateResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  workspaceId: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  template: string;

  @ApiProperty()
  createdById: number;

  @ApiProperty({ nullable: true })
  updatedById: number | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
