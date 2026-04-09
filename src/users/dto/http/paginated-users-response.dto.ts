import { ApiProperty } from '@nestjs/swagger';
import { SafeUserResponseDto } from './safe-user-response.dto';

export class PaginatedUsersResponseDto {
  @ApiProperty({ type: [SafeUserResponseDto] })
  items: SafeUserResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
