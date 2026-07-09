import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { PlanTemplate } from "../database/entities/plan-template.entity";
import type { PlanTemplateResponseDto } from "./dto/plan-template-response.dto";

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(PlanTemplate)
    private readonly planTemplateRepo: Repository<PlanTemplate>,
  ) {}

  async listPublicPlans(): Promise<PlanTemplateResponseDto[]> {
    const rows = await this.planTemplateRepo.find({
      where: { isPublic: true, isActive: true, workspaceId: IsNull() },
      order: { sortOrder: "ASC", id: "ASC" },
    });
    return rows.map((row) => this.toDto(row));
  }

  async findAccessiblePlan(
    planTemplateId: number,
    workspaceId: number,
  ): Promise<PlanTemplate | null> {
    return this.planTemplateRepo.findOne({
      where: [
        {
          id: planTemplateId,
          isActive: true,
          workspaceId: IsNull(),
          isPublic: true,
        },
        {
          id: planTemplateId,
          isActive: true,
          workspaceId,
        },
      ],
    });
  }

  toDto(row: PlanTemplate): PlanTemplateResponseDto {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      isPublic: row.isPublic,
      entitlements: row.entitlements,
      priceMonthly: row.priceMonthly,
      priceYearly: row.priceYearly,
      currency: row.currency,
      sortOrder: row.sortOrder,
    };
  }
}
