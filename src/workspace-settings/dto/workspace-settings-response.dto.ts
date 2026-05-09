import { ApiProperty } from "@nestjs/swagger";

export class WorkspaceSettingsResponseDto {
  @ApiProperty()
  workspaceId: number;

  @ApiProperty({
    description:
      "Workspace default currency (ISO-style code, e.g. UAH, USD). Used as catalog default when creating products without `currency`.",
    example: "UAH",
  })
  currency: string;
}
