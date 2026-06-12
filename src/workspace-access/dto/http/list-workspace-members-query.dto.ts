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

export class ListWorkspaceMembersQueryDto {
  @ApiPropertyOptional({
    description:
      "When true, return only members eligible for chat assignment. " +
      "When false, return only members not eligible. Omit to return all.",
    example: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseOptionalBoolean(value))
  @IsBoolean()
  can_be_assigned_to_chat?: boolean;
}
