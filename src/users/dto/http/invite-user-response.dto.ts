import { ApiProperty } from '@nestjs/swagger';
import { SafeUserResponseDto } from './safe-user-response.dto';

export class InviteUserResponseDto {
  @ApiProperty({ type: SafeUserResponseDto })
  user: SafeUserResponseDto;

  @ApiProperty({
    description:
      'Raw invitation token (send via email). Not persisted; only a hash is stored.',
  })
  invitationToken: string;
}
