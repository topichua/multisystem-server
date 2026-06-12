import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";

export class UpdateAuthProfileRequestDto {
  @ApiPropertyOptional({
    nullable: true,
    description: "Avatar image URL. Pass null to remove.",
    example: "https://cdn.example.com/avatars/me.jpg",
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(2048)
  avatar_src?: string | null;
}
