import {
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { CreateCompanyWithOwnerInput } from './dto/create-company.dto';
import { Company, Source, User, UserStatus } from '../database/entities';
import { PasswordService } from '../users/crypto/password.service';

const DEFAULT_INSTAGRAM_SOURCE_NAME = 'Instagram';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly passwordService: PasswordService,
  ) {}

  async createCompanyWithOwnerAndSource(
    input: CreateCompanyWithOwnerInput,
  ): Promise<{ company: Company; source: Source }> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.dataSource
      .getRepository(User)
      .exist({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const token = input.instagramToken.trim();
    const pageId =
      input.instagramPageId?.trim() && input.instagramPageId.trim().length > 0
        ? input.instagramPageId.trim()
        : 'pending';

    return this.dataSource.transaction(async (mgr) => {
      const userRepo = mgr.getRepository(User);
      const companyRepo = mgr.getRepository(Company);
      const sourceRepo = mgr.getRepository(Source);

      const passwordHash = await this.passwordService.hash(input.password);

      const user = userRepo.create({
        email,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim() || null,
        status: UserStatus.Active,
        passwordHash,
        metadata: {},
      });
      await userRepo.save(user);

      const company = companyRepo.create({
        name: input.companyName.trim(),
        pageId,
        pageToken: token,
        accessToken: token,
        ownerId: user.id,
      });
      await companyRepo.save(company);

      const source = sourceRepo.create({
        name: DEFAULT_INSTAGRAM_SOURCE_NAME,
        companyId: company.id,
        token,
      });
      await sourceRepo.save(source);

      return { company, source };
    });
  }
}
