import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, type EntityManager } from "typeorm";
import {
  ProductVariantCustomFieldValue,
  VariantCustomFieldType,
  WorkspaceVariantCustomField,
} from "../database/entities";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import type {
  CreateVariantCustomFieldDto,
  UpdateVariantCustomFieldDto,
} from "./dto/variant-custom-field-request.dto";
import type {
  VariantCustomFieldDefinitionDto,
  VariantCustomFieldsListResponseDto,
} from "./dto/variant-custom-field-definition.dto";
import {
  resolveVariantCustomFieldValues,
  type VariantCustomFieldValueInput,
} from "./variant-custom-fields.util";

const DEFAULT_FIELDS: Array<{
  key: string;
  label: string;
  type: VariantCustomFieldType;
  options: string[];
  sortOrder: number;
}> = [
  {
    key: "color",
    label: "Color",
    type: VariantCustomFieldType.options,
    options: ["Black", "White", "Red", "Blue", "Green", "Beige"],
    sortOrder: 0,
  },
  {
    key: "size",
    label: "Size",
    type: VariantCustomFieldType.options,
    options: ["XS", "S", "M", "L", "XL", "XXL"],
    sortOrder: 1,
  },
];

@Injectable()
export class VariantCustomFieldsService {
  constructor(
    @InjectRepository(WorkspaceVariantCustomField)
    private readonly fieldRepo: Repository<WorkspaceVariantCustomField>,
    private readonly workspaceContext: WorkspaceAccessContextService,
  ) {}

  async listForOwner(ownerId: number): Promise<VariantCustomFieldsListResponseDto> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    await this.ensureDefaults(workspace.id);
    const rows = await this.fieldRepo.find({
      where: { workspaceId: workspace.id },
      order: { sortOrder: "ASC", id: "ASC" },
    });
    return {
      workspaceId: workspace.id,
      items: rows.map((r) => this.toDto(r)),
    };
  }

  async listDefinitionsForWorkspace(
    workspaceId: number,
  ): Promise<WorkspaceVariantCustomField[]> {
    await this.ensureDefaults(workspaceId);
    return this.fieldRepo.find({
      where: { workspaceId },
      order: { sortOrder: "ASC", id: "ASC" },
    });
  }

  async createForOwner(
    ownerId: number,
    dto: CreateVariantCustomFieldDto,
  ): Promise<VariantCustomFieldDefinitionDto> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    this.validateOptionsForType(dto.type, dto.options);

    const existing = await this.fieldRepo.findOne({
      where: { workspaceId: workspace.id, key: dto.key },
    });
    if (existing) {
      throw new ConflictException(
        `Custom field with key "${dto.key}" already exists in this workspace`,
      );
    }

    const row = await this.fieldRepo.save(
      this.fieldRepo.create({
        workspaceId: workspace.id,
        key: dto.key,
        label: dto.label,
        type: dto.type,
        options:
          dto.type === VariantCustomFieldType.options
            ? (dto.options ?? [])
            : null,
        sortOrder: dto.sortOrder ?? 0,
      }),
    );
    return this.toDto(row);
  }

  async updateForOwner(
    ownerId: number,
    fieldId: number,
    dto: UpdateVariantCustomFieldDto,
  ): Promise<VariantCustomFieldDefinitionDto> {
    const row = await this.requireOwnedField(ownerId, fieldId);

    if (dto.label !== undefined) {
      row.label = dto.label;
    }
    if (dto.sortOrder !== undefined) {
      row.sortOrder = dto.sortOrder;
    }
    if (dto.options !== undefined) {
      if (row.type !== VariantCustomFieldType.options) {
        throw new BadRequestException(
          "options can only be updated on fields with type options",
        );
      }
      row.options = dto.options;
    }

    const saved = await this.fieldRepo.save(row);
    return this.toDto(saved);
  }

  async deleteForOwner(ownerId: number, fieldId: number): Promise<void> {
    const row = await this.requireOwnedField(ownerId, fieldId);
    await this.fieldRepo.remove(row);
  }

  resolveVariantStorage(
    definitions: WorkspaceVariantCustomField[],
    input: {
      customFields?: VariantCustomFieldValueInput[];
    },
  ): VariantCustomFieldValueInput[] {
    try {
      return resolveVariantCustomFieldValues(definitions, input);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(message);
    }
  }

  async upsertValuesForVariant(
    em: EntityManager,
    variantId: number,
    values: VariantCustomFieldValueInput[],
  ): Promise<void> {
    if (values.length === 0) {
      return;
    }
    for (const { fieldId, value } of values) {
      await em.upsert(
        ProductVariantCustomFieldValue,
        { variantId, fieldId, value },
        { conflictPaths: ["variantId", "fieldId"] },
      );
    }
  }

  private async requireOwnedField(
    ownerId: number,
    fieldId: number,
  ): Promise<WorkspaceVariantCustomField> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const row = await this.fieldRepo.findOne({ where: { id: fieldId } });
    if (!row || row.workspaceId !== workspace.id) {
      throw new NotFoundException("Custom field not found");
    }
    return row;
  }

  private async ensureDefaults(workspaceId: number): Promise<void> {
    const count = await this.fieldRepo.count({ where: { workspaceId } });
    if (count > 0) {
      return;
    }
    await this.fieldRepo.save(
      DEFAULT_FIELDS.map((def) =>
        this.fieldRepo.create({
          workspaceId,
          key: def.key,
          label: def.label,
          type: def.type,
          options: def.options,
          sortOrder: def.sortOrder,
        }),
      ),
    );
  }

  private validateOptionsForType(
    type: VariantCustomFieldType,
    options: string[] | undefined,
  ): void {
    if (type === VariantCustomFieldType.options) {
      if (!options?.length) {
        throw new BadRequestException(
          "options is required and must contain at least one value when type is options",
        );
      }
      return;
    }
    if (options?.length) {
      throw new BadRequestException(
        "options must be omitted when type is text",
      );
    }
  }

  private toDto(row: WorkspaceVariantCustomField): VariantCustomFieldDefinitionDto {
    return {
      id: row.id,
      key: row.key,
      label: row.label,
      type: row.type,
      ...(row.type === VariantCustomFieldType.options && row.options?.length
        ? { options: row.options }
        : {}),
      sortOrder: row.sortOrder,
    };
  }
}
