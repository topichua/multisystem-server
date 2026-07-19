import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";
import { WorkspaceMemberWorkStatus } from "../../../database/entities";

export class UpdateMyWorkStatusRequestDto {
  @ApiProperty({
    enum: WorkspaceMemberWorkStatus,
    example: WorkspaceMemberWorkStatus.ACCEPTING_NEW_CHATS,
  })
  @IsEnum(WorkspaceMemberWorkStatus)
  work_status: WorkspaceMemberWorkStatus;
}
