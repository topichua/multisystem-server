import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsPositive } from "class-validator";

export class UpdateWorkspaceMemberRequestDto {
  @ApiProperty({
    description: "Workspace role id from GET /workspace/roles",
    example: 3,
  })
  @IsInt()
  @IsPositive()
  role_id: number;
}
