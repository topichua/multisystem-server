import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === true || value === "true" || value === 1 || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }
  return undefined;
}

/** GET /clients/:id — optional expansions. */
export class GetClientQueryDto {
  @ApiPropertyOptional({
    description:
      "When true, includes `orderStats` on the client. `avatar_src` is always included on GET.",
    example: true,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseOptionalBoolean(value))
  @IsBoolean()
  include_order_stat?: boolean;
}
