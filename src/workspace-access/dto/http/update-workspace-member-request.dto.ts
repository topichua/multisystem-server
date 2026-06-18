import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsPositive } from "class-validator";

export class UpdateWorkspaceMemberRequestDto {
  @ApiProperty({
    description: "Whether this member can be assigned to conversations.",
    example: true,
  })
  @IsBoolean()
  can_be_assigned_to_chat: boolean;

  @ApiProperty({
    description: "Workspace role id from GET /workspace/roles",
    example: 3,
  })
  @IsInt()
  @IsPositive()
  role_id: number;
}
