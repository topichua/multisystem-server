import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class AssignConversationGroupRequestDto {
  @ApiProperty({ description: 'Conversation group id within the current workspace' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  groupId: number;
}
