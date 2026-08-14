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
  ListWorkspaceTemplatesQueryDto,
  RenderWorkspaceTemplateDto,
  UpdateWorkspaceTemplateDto,
} from "./dto/workspace-template-request.dto";
import type {
  WorkspaceTemplateRenderResponseDto,
  WorkspaceTemplateVariablesResponseDto,
} from "./dto/workspace-template-response.dto";
import { listTemplateVariableCatalog } from "./logic/template-variables.logic";
import { WorkspaceTemplateRenderService } from "./workspace-template-render.service";

@Injectable()
export class WorkspaceTemplatesService {
  constructor(
    private readonly workspaceContext: WorkspaceAccessContextService,
    @InjectRepository(WorkspaceTemplate)
    private readonly templateRepo: Repository<WorkspaceTemplate>,
    private readonly renderService: WorkspaceTemplateRenderService,
  ) {}

  getVariablesCatalog(): WorkspaceTemplateVariablesResponseDto {
    return { types: listTemplateVariableCatalog() };
  }

  async listForOwner(
    ownerId: number,
    query?: ListWorkspaceTemplatesQueryDto,
  ): Promise<WorkspaceTemplate[]> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    return this.templateRepo.find({
      where: {
        workspaceId: workspace.id,
        ...(query?.type != null ? { type: query.type } : {}),
        ...(query?.isActive != null ? { isActive: query.isActive } : {}),
      },
      order: { id: "ASC" },
    });
  }

  async getForOwner(
    ownerId: number,
    templateId: number,
  ): Promise<WorkspaceTemplate> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
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
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const template = this.templateRepo.create({
      workspaceId: workspace.id,
      type: dto.type,
      name: dto.name.trim(),
      template: dto.template.trim(),
      isActive: dto.isActive ?? true,
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
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const template = await this.templateRepo.findOne({
      where: { id: templateId, workspaceId: workspace.id },
    });
    if (!template) {
      throw new NotFoundException("Template not found");
    }
    if (dto.type !== undefined) {
      template.type = dto.type;
    }
    if (dto.name !== undefined) {
      template.name = dto.name.trim();
    }
    if (dto.template !== undefined) {
      template.template = dto.template.trim();
    }
    if (dto.isActive !== undefined) {
      template.isActive = dto.isActive;
    }
    template.updatedById = ownerId;
    return this.templateRepo.save(template);
  }

  async deleteForOwner(ownerId: number, templateId: number): Promise<void> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const template = await this.templateRepo.findOne({
      where: { id: templateId, workspaceId: workspace.id },
    });
    if (!template) {
      throw new NotFoundException("Template not found");
    }
    await this.templateRepo.remove(template);
  }

  async renderForOwner(
    ownerId: number,
    templateId: number,
    dto: RenderWorkspaceTemplateDto,
  ): Promise<WorkspaceTemplateRenderResponseDto> {
    if (dto.orderId == null && dto.conversationId == null) {
      throw new BadRequestException(
        "Provide orderId (order templates) or conversationId (chat templates)",
      );
    }

    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const template = await this.templateRepo.findOne({
      where: { id: templateId, workspaceId: workspace.id },
    });
    if (!template) {
      throw new NotFoundException("Template not found");
    }

    const rendered = await this.renderService.render({
      template,
      workspaceId: workspace.id,
      orderId: dto.orderId,
      conversationId: dto.conversationId,
    });

    return {
      templateId: template.id,
      type: template.type,
      text: rendered.text,
      variables: rendered.variables,
    };
  }
}
