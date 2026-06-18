import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import {
  CompleteWorkspaceMemberRegistrationRequestDto,
  CompleteWorkspaceMemberRegistrationResponseDto,
  WorkspaceMemberRegistrationFormResponseDto,
} from "./dto/http/workspace-member-registration.dto";
import { WorkspaceMembersService } from "./workspace-members.service";

@ApiTags("workspace — members")
@Controller("workspaces/members")
export class WorkspaceMembersRegisterController {
  constructor(private readonly members: WorkspaceMembersService) {}

  @Get("register")
  @ApiOperation({
    summary: "Load workspace member invitation registration form",
    description:
      "Public endpoint used by the client registration page at APP_URL/invitation/{hash}.",
  })
  @ApiQuery({
    name: "hash",
    required: true,
    description: "Invitation token from the email link.",
  })
  @ApiOkResponse({ type: WorkspaceMemberRegistrationFormResponseDto })
  async getRegistrationForm(
    @Query("hash") hash: string,
  ): Promise<WorkspaceMemberRegistrationFormResponseDto> {
    return this.members.getRegistrationForm(this.requireHash(hash));
  }

  @Post("register")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Complete workspace member registration",
    description:
      "Activates the invited user and workspace member, then returns a JWT.",
  })
  @ApiQuery({
    name: "hash",
    required: true,
    description: "Invitation token from the email link.",
  })
  @ApiBody({ type: CompleteWorkspaceMemberRegistrationRequestDto })
  @ApiOkResponse({ type: CompleteWorkspaceMemberRegistrationResponseDto })
  async completeRegistration(
    @Query("hash") hash: string,
    @Body() dto: CompleteWorkspaceMemberRegistrationRequestDto,
  ): Promise<CompleteWorkspaceMemberRegistrationResponseDto> {
    return this.members.completeRegistration(this.requireHash(hash), dto);
  }

  private requireHash(raw: string | undefined): string {
    const hash = raw?.trim() ?? "";
    if (!hash) {
      throw new BadRequestException("hash query parameter is required");
    }
    return hash;
  }
}
