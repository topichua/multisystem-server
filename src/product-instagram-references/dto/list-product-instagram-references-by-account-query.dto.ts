import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsOptional, IsString, MinLength } from "class-validator";

export class ListProductInstagramReferencesByAccountQueryDto {
  @ApiPropertyOptional({
    description:
      "Instagram Business Account id (Graph `instagram_business_account.id`). " +
      "Alias: `businessAccountId`.",
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === "") return undefined;
    const s = typeof value === "string" ? value.trim() : String(value).trim();
    return s.length > 0 ? s : undefined;
  })
  @IsString()
  @MinLength(1)
  instagram_account_id?: string;

  @ApiPropertyOptional({
    description: "Same as `instagram_account_id` (from GET /api/instagram/integrations).",
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === "") return undefined;
    const s = typeof value === "string" ? value.trim() : String(value).trim();
    return s.length > 0 ? s : undefined;
  })
  @IsString()
  @MinLength(1)
  businessAccountId?: string;

  @ApiPropertyOptional({
    description:
      "Workspace scope; defaults to your primary workspace. Must be accessible to you.",
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === "") return undefined;
    const n = Number(typeof value === "string" ? value.trim() : value);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  })
  workspace_id?: number;
}
