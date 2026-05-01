import { ApiProperty } from '@nestjs/swagger';
import { CompanyResponseDto } from './company-response.dto';

export class CreateWorkspaceWithOwnerResponseDto extends CompanyResponseDto {
  @ApiProperty()
  workspaceName: string;

  @ApiProperty()
  userId: number;

  @ApiProperty()
  userEmail: string;
}
