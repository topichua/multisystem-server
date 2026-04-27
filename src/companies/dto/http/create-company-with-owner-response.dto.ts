import { ApiProperty } from '@nestjs/swagger';
import { CompanyResponseDto } from './company-response.dto';

export class CreateCompanyWithOwnerResponseDto extends CompanyResponseDto {
  @ApiProperty({ description: 'New Instagram (or primary) source row for this company.' })
  sourceId: number;
}
