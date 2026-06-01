import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, type EntityManager } from "typeorm";
import {
  ProductVariantCustomFieldValue,
  VariantCustomFieldType,
  Workspace,
  WorkspaceMember,
  WorkspaceMemberStatus,
  WorkspaceVariantCustomField,
  WorkspaceVariantCustomFieldOption,
} from "../database/entities";
import type { PermissionKey } from "../workspace-access/permissions/permission-keys";
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
  apiTypeToStorageType,
  normalizeCustomFieldName,
  normalizeCustomFieldOptionValue,
  type ResolvedVariantAttribute,
  type VariantCustomFieldAttributeInput,
} from "./variant-custom-fields.resolve.util";
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
    @InjectRepository(WorkspaceVariantCustomFieldOption)
    private readonly optionRepo: Repository<WorkspaceVariantCustomFieldOption>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    private readonly workspaceContext: WorkspaceAccessContextService,
  ) {}

  async listForOwner(ownerId: number): Promise<VariantCustomFieldsListResponseDto> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    await this.ensureDefaults(workspace.id);
    const rows = await this.fieldRepo.find({
      where: { workspaceId: workspace.id },
      relations: { fieldOptions: true },
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
      relations: { fieldOptions: true },
      order: { sortOrder: "ASC", id: "ASC" },
    });
  }

  async createForOwner(
    ownerId: number,
    dto: CreateVariantCustomFieldDto,
  ): Promise<VariantCustomFieldDefinitionDto> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    await this.assertWorkspacePermission(
      ownerId,
      workspace.id,
      "products.variant_custom_fields.create",
    );
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
        sortOrder: dto.sortOrder ?? 0,
      }),
    );
    if (dto.type === VariantCustomFieldType.options && dto.options?.length) {
      await this.insertOptionLabels(row.id, dto.options);
    }
    return this.toDto(await this.requireFieldWithOptions(row.id));
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
      await this.syncOptionLabels(row.id, dto.options);
    }

    const saved = await this.fieldRepo.save(row);
    return this.toDto(await this.requireFieldWithOptions(saved.id));
  }

  async deleteForOwner(ownerId: number, fieldId: number): Promise<void> {
    const row = await this.requireOwnedField(ownerId, fieldId);
    await this.fieldRepo.remove(row);
  }

  /** Legacy `{ fieldId, value }` resolution (Instagram drafts, internal). */
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

  /**
   * Resolves `customFields: [{ field, value }]` from product create/update payloads.
   */
  async resolveVariantAttributesFromPayload(
    ownerId: number,
    workspaceId: number,
    attributes: VariantCustomFieldAttributeInput[] | undefined,
    em?: EntityManager,
  ): Promise<ResolvedVariantAttribute[]> {
    if (!attributes?.length) {
      return [];
    }

    const fieldRepo = em
      ? em.getRepository(WorkspaceVariantCustomField)
      : this.fieldRepo;

    const out: ResolvedVariantAttribute[] = [];
    for (const item of attributes) {
      const displayValue = item.value.trim();
      if (!displayValue) {
        continue;
      }

      const field = await this.resolveFieldFromPayload(
        ownerId,
        workspaceId,
        item.field,
        fieldRepo,
        em,
      );

      if (field.type === VariantCustomFieldType.options) {
        const optionRepo = em
          ? em.getRepository(WorkspaceVariantCustomFieldOption)
          : this.optionRepo;
        const option = await this.resolveOptionFromPayload(
          ownerId,
          workspaceId,
          field,
          displayValue,
          optionRepo,
          em,
        );
        out.push({
          fieldId: field.id,
          optionId: option.id,
          textValue: null,
          value: option.label,
        });
      } else {
        if (displayValue.length > 512) {
          throw new BadRequestException(
            `Custom field "${field.key}" text value is too long`,
          );
        }
        out.push({
          fieldId: field.id,
          optionId: null,
          textValue: displayValue,
          value: displayValue,
        });
      }
    }

    return out;
  }

  /** Resolves legacy `{ fieldId, value }` rows (Instagram draft, internal). */
  async resolveLegacyFieldIdValues(
    workspaceId: number,
    values: VariantCustomFieldValueInput[],
    em?: EntityManager,
  ): Promise<ResolvedVariantAttribute[]> {
    if (values.length === 0) {
      return [];
    }
    const fieldRepo = em
      ? em.getRepository(WorkspaceVariantCustomField)
      : this.fieldRepo;
    const optionRepo = em
      ? em.getRepository(WorkspaceVariantCustomFieldOption)
      : this.optionRepo;

    const out: ResolvedVariantAttribute[] = [];
    for (const { fieldId, value } of values) {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }
      const field = await fieldRepo.findOne({
        where: { id: fieldId, workspaceId },
      });
      if (!field) {
        throw new BadRequestException(`Unknown custom field id ${fieldId}`);
      }

      if (field.type === VariantCustomFieldType.options) {
        const normalized = normalizeCustomFieldOptionValue(trimmed);
        let option = await this.findOptionByNormalizedLabel(
          optionRepo,
          field.id,
          trimmed,
        );
        if (!option) {
          const allowedLabels = await this.listOptionLabelsForField(
            optionRepo,
            field.id,
          );
          const allowed = allowedLabels.map((l) =>
            normalizeCustomFieldOptionValue(l),
          );
          if (allowed.length > 0 && !allowed.includes(normalized)) {
            throw new BadRequestException(
              `Custom field "${field.key}" value must be one of: ${allowedLabels.join(", ")}`,
            );
          }
          option = await optionRepo.save(
            optionRepo.create({
              fieldId: field.id,
              label: trimmed,
            }),
          );
        }
        out.push({
          fieldId: field.id,
          optionId: option.id,
          textValue: null,
          value: option.label,
        });
      } else {
        if (trimmed.length > 512) {
          throw new BadRequestException(
            `Custom field "${field.key}" value is too long`,
          );
        }
        out.push({
          fieldId: field.id,
          optionId: null,
          textValue: trimmed,
          value: trimmed,
        });
      }
    }
    return out;
  }

  async upsertValuesForVariant(
    em: EntityManager,
    variantId: number,
    values: ResolvedVariantAttribute[],
  ): Promise<void> {
    if (values.length === 0) {
      return;
    }
    for (const row of values) {
      await em.upsert(
        ProductVariantCustomFieldValue,
        {
          variantId,
          fieldId: row.fieldId,
          value: row.value,
          optionId: row.optionId,
          textValue: row.textValue,
        },
        { conflictPaths: ["variantId", "fieldId"] },
      );
    }
  }

  private async resolveFieldFromPayload(
    ownerId: number,
    workspaceId: number,
    ref: VariantCustomFieldAttributeInput["field"],
    fieldRepo: Repository<WorkspaceVariantCustomField>,
    em?: EntityManager,
  ): Promise<WorkspaceVariantCustomField> {
    if (ref.id != null) {
      const row = await fieldRepo.findOne({ where: { id: ref.id } });
      if (!row || row.workspaceId !== workspaceId) {
        throw new NotFoundException(
          `Custom field id ${ref.id} was not found in this workspace`,
        );
      }
      return row;
    }

    const name = ref.name?.trim();
    const apiType = ref.type;
    if (!name || !apiType) {
      throw new BadRequestException(
        "field.name and field.type are required when field.id is omitted",
      );
    }

    const key = normalizeCustomFieldName(name);
    if (!key) {
      throw new BadRequestException("field.name must not be empty");
    }

    const existing = await fieldRepo.findOne({
      where: { workspaceId, key },
    });
    if (existing) {
      const expectedType = apiTypeToStorageType(apiType);
      if (existing.type !== expectedType) {
        throw new BadRequestException(
          `Custom field "${name}" already exists with a different type`,
        );
      }
      return existing;
    }

    await this.assertWorkspacePermission(
      ownerId,
      workspaceId,
      "products.variant_custom_fields.create",
    );

    const storageType = apiTypeToStorageType(apiType);
    const created = await fieldRepo.save(
      fieldRepo.create({
        workspaceId,
        key,
        label: name,
        type: storageType,
        sortOrder: await this.nextFieldSortOrder(workspaceId, fieldRepo),
      }),
    );
    return created;
  }

  private async resolveOptionFromPayload(
    ownerId: number,
    workspaceId: number,
    field: WorkspaceVariantCustomField,
    displayValue: string,
    optionRepo: Repository<WorkspaceVariantCustomFieldOption>,
    em?: EntityManager,
  ): Promise<WorkspaceVariantCustomFieldOption> {
    if (field.type !== VariantCustomFieldType.options) {
      throw new BadRequestException(
        `Custom field "${field.key}" is not an OPTION field`,
      );
    }

    const normalized = normalizeCustomFieldOptionValue(displayValue);
    if (!normalized) {
      throw new BadRequestException("value must not be empty");
    }

    const label = displayValue.trim();
    const existing = await this.findOptionByNormalizedLabel(
      optionRepo,
      field.id,
      label,
    );
    if (existing) {
      return existing;
    }

    await this.assertWorkspacePermission(
      ownerId,
      workspaceId,
      "products.variant_custom_field_options.create",
    );

    return optionRepo.save(
      optionRepo.create({
        fieldId: field.id,
        label,
      }),
    );
  }

  private async nextFieldSortOrder(
    workspaceId: number,
    fieldRepo: Repository<WorkspaceVariantCustomField>,
  ): Promise<number> {
    const max = await fieldRepo.maximum("sortOrder", { workspaceId });
    return (max ?? -1) + 1;
  }

  private async requireFieldWithOptions(
    fieldId: number,
  ): Promise<WorkspaceVariantCustomField> {
    const row = await this.fieldRepo.findOne({
      where: { id: fieldId },
      relations: { fieldOptions: true },
    });
    if (!row) {
      throw new NotFoundException("Custom field not found");
    }
    row.fieldOptions?.sort((a, b) => a.id - b.id);
    return row;
  }

  private async insertOptionLabels(
    fieldId: number,
    labels: string[],
    em?: EntityManager,
  ): Promise<void> {
    const optionRepo = em
      ? em.getRepository(WorkspaceVariantCustomFieldOption)
      : this.optionRepo;
    for (const raw of labels) {
      const label = raw.trim();
      if (!label) {
        continue;
      }
      const exists = await this.findOptionByNormalizedLabel(
        optionRepo,
        fieldId,
        label,
      );
      if (!exists) {
        await optionRepo.save(
          optionRepo.create({ fieldId, label }),
        );
      }
    }
  }

  /** Adds any missing option labels; does not remove existing rows (may be referenced). */
  private async syncOptionLabels(
    fieldId: number,
    labels: string[],
  ): Promise<void> {
    await this.insertOptionLabels(fieldId, labels);
  }

  private async listOptionLabelsForField(
    optionRepo: Repository<WorkspaceVariantCustomFieldOption>,
    fieldId: number,
  ): Promise<string[]> {
    const rows = await optionRepo.find({
      where: { fieldId },
      order: { id: "ASC" },
    });
    return rows.map((o) => o.label);
  }

  private findOptionByNormalizedLabel(
    optionRepo: Repository<WorkspaceVariantCustomFieldOption>,
    fieldId: number,
    label: string,
  ): Promise<WorkspaceVariantCustomFieldOption | null> {
    const normalized = normalizeCustomFieldOptionValue(label);
    if (!normalized) {
      return Promise.resolve(null);
    }
    return optionRepo
      .createQueryBuilder("o")
      .where("o.field_id = :fieldId", { fieldId })
      .andWhere("lower(btrim(o.label)) = :normalized", { normalized })
      .getOne();
  }

  private async assertWorkspacePermission(
    userId: number,
    workspaceId: number,
    permission: PermissionKey,
  ): Promise<void> {
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }
    if (workspace.ownerId === userId) {
      return;
    }

    const member = await this.memberRepo.findOne({
      where: {
        workspaceId,
        userId,
        status: WorkspaceMemberStatus.ACTIVE,
      },
      relations: { role: true },
    });
    const permissions = member?.role?.permissions ?? [];
    if (!permissions.includes(permission) && !permissions.includes("products.write")) {
      throw new ForbiddenException(
        `Missing permission: ${permission}`,
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
    for (const def of DEFAULT_FIELDS) {
      const row = await this.fieldRepo.save(
        this.fieldRepo.create({
          workspaceId,
          key: def.key,
          label: def.label,
          type: def.type,
          sortOrder: def.sortOrder,
        }),
      );
      if (def.options.length > 0) {
        await this.insertOptionLabels(row.id, def.options);
      }
    }
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
    const optionLabels = [...(row.fieldOptions ?? [])]
      .sort((a, b) => a.id - b.id)
      .map((o) => o.label);
    return {
      id: row.id,
      key: row.key,
      label: row.label,
      type: row.type,
      ...(row.type === VariantCustomFieldType.options && optionLabels.length
        ? { options: optionLabels }
        : {}),
      sortOrder: row.sortOrder,
    };
  }
}
