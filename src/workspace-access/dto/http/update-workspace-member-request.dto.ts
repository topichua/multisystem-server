import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class UpdateWorkspaceMemberRequestDto {
  @ApiProperty({
    description: "Whether this member can be assigned to conversations.",
    example: true,
  })
  @IsBoolean()
  can_be_assigned_to_chat: boolean;
}
