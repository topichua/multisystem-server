import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { CompaniesService } from './companies.service';
import { CreateCompanyWithOwnerRequestDto } from './dto/http/create-company-with-owner-request.dto';
import { CreateCompanyWithOwnerResponseDto } from './dto/http/create-company-with-owner-response.dto';

@ApiTags('admin — companies')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create company, owner user, and Instagram source',
    description:
      'Creates an active user (owner), a company owned by that user, and a `sources` row with the given Instagram token.',
  })
  @ApiOkResponse({ type: CreateCompanyWithOwnerResponseDto })
  async create(
    @Body() dto: CreateCompanyWithOwnerRequestDto,
  ): Promise<CreateCompanyWithOwnerResponseDto> {
    const { company, source } =
      await this.companiesService.createCompanyWithOwnerAndSource({
        companyName: dto.companyName,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        password: dto.password,
        instagramToken: dto.instagramToken,
        instagramPageId: dto.instagramPageId,
        instagramAccountId: dto.instagramAccountId,
      });
    return {
      id: company.id,
      name: company.name,
      pageId: company.pageId,
      userAccessToken: company.userAccessToken,
      accessToken: company.accessToken,
      instagramAccountId: company.instagramAccountId,
      ownerId: company.ownerId,
      sourceId: source.id,
    };
  }
}
