import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WorkspaceTemplate } from "./workspace-template.entity";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import type {
  CreateWorkspaceTemplateDto,
  UpdateWorkspaceTemplateDto,
} from "./dto/workspace-template-request.dto";

@Injectable()
export class WorkspaceTemplatesService {
  constructor(
    private readonly workspaceContext: WorkspaceAccessContextService,
    @InjectRepository(WorkspaceTemplate)
    private readonly templateRepo: Repository<WorkspaceTemplate>,
  ) {}

  async listForOwner(ownerId: number): Promise<WorkspaceTemplate[]> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    return this.templateRepo.find({
      where: { workspaceId: workspace.id },
      order: { id: "ASC" },
    });
  }

  async getForOwner(ownerId: number, templateId: number): Promise<WorkspaceTemplate> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const template = await this.templateRepo.findOne({
      where: { id: templateId, workspaceId: workspace.id },
    });
    if (!template) {
      throw new NotFoundException("Template not found");
    }
    return template;
  }

  async createForOwner(
    ownerId: number,
    dto: CreateWorkspaceTemplateDto,
  ): Promise<WorkspaceTemplate> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const template = this.templateRepo.create({
      workspaceId: workspace.id,
      name: dto.name.trim(),
      template: dto.template.trim(),
      createdById: ownerId,
      updatedById: ownerId,
    });
    return this.templateRepo.save(template);
  }

  async updateForOwner(
    ownerId: number,
    templateId: number,
    dto: UpdateWorkspaceTemplateDto,
  ): Promise<WorkspaceTemplate> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const template = await this.templateRepo.findOne({
      where: { id: templateId, workspaceId: workspace.id },
    });
    if (!template) {
      throw new NotFoundException("Template not found");
    }
    if (dto.name !== undefined) {
      template.name = dto.name.trim();
    }
    if (dto.template !== undefined) {
      template.template = dto.template.trim();
    }
    template.updatedById = ownerId;
    return this.templateRepo.save(template);
  }

  async deleteForOwner(ownerId: number, templateId: number): Promise<void> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const template = await this.templateRepo.findOne({
      where: { id: templateId, workspaceId: workspace.id },
    });
    if (!template) {
      throw new NotFoundException("Template not found");
    }
    await this.templateRepo.remove(template);
  }
}
