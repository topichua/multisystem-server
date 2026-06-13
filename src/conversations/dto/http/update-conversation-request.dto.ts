import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  Min,
  ValidateIf,
} from "class-validator";

export class UpdateConversationRequestDto {
  @ApiPropertyOptional({
    nullable: true,
    description: "Conversation group id within the current workspace",
  })
  @IsOptional()
  @ValidateIf((_, value) => value != null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  groupId?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Workspace member id responsible for this conversation. Pass null to clear.",
  })
  @IsOptional()
  @ValidateIf((_, value) => value != null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  responsible_member_id?: number | null;
}
