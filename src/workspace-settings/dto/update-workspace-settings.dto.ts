import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class UpdateWorkspaceSettingsDto {
  @ApiProperty({
    description:
      "Default currency for the workspace (3–8 chars, letters/digits).",
    example: "USD",
  })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toUpperCase() : value,
  )
  @MinLength(3)
  @MaxLength(8)
  @Matches(/^[A-Z0-9]+$/, {
    message: "currency must be 3–8 alphanumeric characters (e.g. UAH, USD)",
  })
  currency: string;
}
