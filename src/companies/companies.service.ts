import { ConflictException, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import type { CreateCompanyWithOwnerInput } from "./dto/create-company.dto";
import { User, UserStatus, Workspace } from "../database/entities";
import { PasswordService } from "../users/crypto/password.service";

@Injectable()
export class CompaniesService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly passwordService: PasswordService,
  ) {}

  async createCompanyWithOwner(
    input: CreateCompanyWithOwnerInput,
  ): Promise<{ workspace: Workspace; user: User }> {
    const email = input.userEmail.trim().toLowerCase();
    const existing = await this.dataSource
      .getRepository(User)
      .exist({ where: { email } });
    if (existing) {
      throw new ConflictException("Email already in use");
    }

    const passwordHash = await this.passwordService.hash(input.password);

    return this.dataSource.transaction(async (mgr) => {
      const userRepo = mgr.getRepository(User);
      const workspaceRepo = mgr.getRepository(Workspace);

      const user = userRepo.create({
        email,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim() || null,
        status: UserStatus.Active,
        passwordHash,
        metadata: {},
      });
      await userRepo.save(user);

      const workspace = workspaceRepo.create({
        name: input.workspaceName.trim(),
        ownerId: user.id,
      });
      await workspaceRepo.save(workspace);

      return { workspace, user };
    });
  }
}
