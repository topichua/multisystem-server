import { ConflictException, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import type { CreateCompanyWithOwnerInput } from "./dto/create-company.dto";
import { User, UserStatus, Workspace } from "../database/entities";
import { ConversationGroupDefaultsService } from "../conversations/conversation-group-defaults.service";
import { OrderStatusDefaultsService } from "../orders/order-status-defaults.service";
import { OrderStatusAutomationDefaultsService } from "../order-status-automations/order-status-automation-defaults.service";
import { PasswordService } from "../users/crypto/password.service";

@Injectable()
export class CompaniesService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly passwordService: PasswordService,
    private readonly conversationGroupDefaults: ConversationGroupDefaultsService,
    private readonly orderStatusDefaults: OrderStatusDefaultsService,
    private readonly automationDefaults: OrderStatusAutomationDefaultsService,
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

    const result = await this.dataSource.transaction(async (mgr) => {
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

    await this.conversationGroupDefaults.ensureSystemGroups(result.workspace.id);
    await this.orderStatusDefaults.ensureSystemStatuses(result.workspace.id);
    await this.automationDefaults.createRecommendedDeliveryAutomations(
      result.workspace.id,
    );
    await this.automationDefaults.createRecommendedPaymentAutomations(
      result.workspace.id,
    );
    return result;
  }
}
