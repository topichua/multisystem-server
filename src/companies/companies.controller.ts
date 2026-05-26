import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { SuperAdminGuard } from "../auth/super-admin.guard";
import { CompaniesService } from "./companies.service";
import { CreateCompanyWithOwnerRequestDto } from "./dto/http/create-company-with-owner-request.dto";
import { CreateWorkspaceWithOwnerResponseDto } from "./dto/http/create-workspace-with-owner-response.dto";

@ApiTags("admin — companies")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller("companies")
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @ApiOperation({
    summary: "Create workspace and owner user",
    description:
      "Creates a `workspace` and an active `users` row (owner) with the given bcrypt-backed password. " +
      "No Instagram row is created until the owner completes Facebook Login via POST /integrations.",
  })
  @ApiOkResponse({ type: CreateWorkspaceWithOwnerResponseDto })
  async create(
    @Body() dto: CreateCompanyWithOwnerRequestDto,
  ): Promise<CreateWorkspaceWithOwnerResponseDto> {
    const { workspace, user } =
      await this.companiesService.createCompanyWithOwner({
        workspaceName: dto.workspace_name.trim(),
        userEmail: dto.user_email.trim(),
        firstName: dto.first_name.trim(),
        lastName: dto.last_name?.trim() ?? "",
        password: dto.password,
      });
    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      userId: user.id,
      userEmail: user.email,
    };
  }
}
