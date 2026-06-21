import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

export class StartTelegramQrLoginRequestDto {
  @ApiPropertyOptional({
    description: "Workspace id (defaults to your primary workspace)",
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workspace_id?: number;
}
