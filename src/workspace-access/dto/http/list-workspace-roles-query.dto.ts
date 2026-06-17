import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  return undefined;
}

export class ListWorkspaceRolesQueryDto {
  @ApiPropertyOptional({
    description:
      "When true, each role includes membersCount — active workspace members assigned to that role.",
    example: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseOptionalBoolean(value))
  @IsBoolean()
  include_members_count?: boolean;
}
