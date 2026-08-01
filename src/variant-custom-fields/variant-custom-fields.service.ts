import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository, type EntityManager } from "typeorm";
import {
  ProductVariantCustomFieldValue,
  VariantCustomFieldType,
  WorkspaceVariantCustomField,
  WorkspaceVariantCustomFieldOption,
} from "../database/entities";
import { ProductAuthorizationService } from "../workspace-access/product-authorization.service";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import type {
  CreateVariantCustomFieldDto,
  UpdateVariantCustomFieldDto,
} from "./dto/variant-custom-field-request.dto";
import type {
  VariantCustomFieldDefinitionDto,
  VariantCustomFieldsListResponseDto,
} from "./dto/variant-custom-field-definition.dto";
import type { VariantCustomFieldOptionDto } from "./dto/variant-custom-field-option.dto";
import type {
  InstallSystemFieldLibraryGroupRequestDto,
  InstallSystemFieldLibraryGroupResponseDto,
  InstallSystemFieldLibraryRequestDto,
  InstallSystemFieldLibraryResponseDto,
  SystemFieldLibraryListResponseDto,
} from "./dto/system-field-library.dto";
import {
  buildSystemFieldLabel,
  findSystemFieldLibraryEntry,
  resolveLibraryEntries,
  SYSTEM_FIELD_LIBRARY_FEATURED_KEYS,
  SYSTEM_FIELD_LIBRARY_GROUPS,
  typeDisplayLabel,
} from "./system-field-library";
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

@Injectable()
export class VariantCustomFieldsService {
  constructor(
    @InjectRepository(WorkspaceVariantCustomField)
    private readonly fieldRepo: Repository<WorkspaceVariantCustomField>,
    @InjectRepository(WorkspaceVariantCustomFieldOption)
    private readonly optionRepo: Repository<WorkspaceVariantCustomFieldOption>,
    @InjectRepository(ProductVariantCustomFieldValue)
    private readonly valueRepo: Repository<ProductVariantCustomFieldValue>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly productAuthz: ProductAuthorizationService,
  ) {}

  async listForOwner(
    ownerId: number,
  ): Promise<VariantCustomFieldsListResponseDto> {
    await this.productAuthz.requireRead(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
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

  /**
   * System library of proposed characteristics (featured + grouped).
   * Matches «ДОДАТИ ПОЛЕ З ШАБЛОНУ» UI.
   */
  async listSystemLibraryForOwner(
    ownerId: number,
  ): Promise<SystemFieldLibraryListResponseDto> {
    await this.productAuthz.requireRead(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const existing = await this.fieldRepo.find({
      where: { workspaceId: workspace.id },
      select: { id: true, key: true },
    });
    const byKey = new Map(existing.map((row) => [row.key, row.id]));

    const mapField = (field: {
      key: string;
      label: string;
      type: VariantCustomFieldType;
      options: string[];
      description?: string;
      sortOrder: number;
    }) => {
      const workspaceFieldId = byKey.get(field.key) ?? null;
      const typeLabel = typeDisplayLabel(field.type);
      return {
        key: field.key,
        label: field.label,
        displayLabel: `${field.label} (${typeLabel})`,
        type: field.type,
        typeLabel,
        options: field.options,
        ...(field.description ? { description: field.description } : {}),
        sortOrder: field.sortOrder,
        alreadyInstalled: workspaceFieldId != null,
        workspaceFieldId,
      };
    };

    const featured = resolveLibraryEntries(
      SYSTEM_FIELD_LIBRARY_FEATURED_KEYS,
    ).map(mapField);

    const groups = [...SYSTEM_FIELD_LIBRARY_GROUPS]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
      .map((group) => {
        const fields = resolveLibraryEntries(group.fieldKeys).map(mapField);
        return {
          key: group.key,
          label: group.label,
          icon: group.icon,
          fieldCount: fields.length,
          sortOrder: group.sortOrder,
          fields,
        };
      });

    return { workspaceId: workspace.id, featured, groups };
  }

  /**
   * Install a system library field into the workspace (creates definition + options).
   */
  async installSystemLibraryFieldForOwner(
    ownerId: number,
    dto: InstallSystemFieldLibraryRequestDto,
  ): Promise<InstallSystemFieldLibraryResponseDto> {
    const key = dto.key.trim().toLowerCase();
    const entry = findSystemFieldLibraryEntry(key);
    if (!entry) {
      throw new NotFoundException(
        `System library field "${key}" is not available`,
      );
    }

    const groupKey = dto.groupKey?.trim().toLowerCase() || null;
    let group =
      groupKey == null
        ? null
        : SYSTEM_FIELD_LIBRARY_GROUPS.find((g) => g.key === groupKey) ?? null;
    if (groupKey && !group) {
      throw new BadRequestException(
        `Unknown library groupKey "${groupKey}"`,
      );
    }
    if (group && !group.fieldKeys.includes(entry.key)) {
      throw new BadRequestException(
        `Field "${entry.key}" is not part of group "${group.key}"`,
      );
    }

    const displayName = entry.label.trim();
    const label =
      group != null
        ? buildSystemFieldLabel(group.label, displayName)
        : displayName;

    const field = await this.createForOwner(ownerId, {
      key: entry.key,
      label,
      displayName,
      type: entry.type,
      options:
        entry.type === VariantCustomFieldType.options
          ? entry.options
          : undefined,
      sortOrder: entry.sortOrder,
    });

    return { field, groupKey: group?.key ?? null };
  }

  /**
   * Install every field from a system library group.
   * Already-present keys are skipped (not an error).
   */
  async installSystemLibraryGroupForOwner(
    ownerId: number,
    dto: InstallSystemFieldLibraryGroupRequestDto,
  ): Promise<InstallSystemFieldLibraryGroupResponseDto> {
    const groupKey = dto.groupKey.trim().toLowerCase();
    const group = SYSTEM_FIELD_LIBRARY_GROUPS.find((g) => g.key === groupKey);
    if (!group) {
      throw new NotFoundException(
        `System library group "${groupKey}" is not available`,
      );
    }

    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    await this.productAuthz.requireCharacteristicsManage(
      ownerId,
      undefined,
      workspace.id,
    );

    const existing = await this.fieldRepo.find({
      where: { workspaceId: workspace.id },
      select: { id: true, key: true },
    });
    const byKey = new Map(existing.map((row) => [row.key, row.id]));

    const installed: InstallSystemFieldLibraryResponseDto["field"][] = [];
    const skipped: InstallSystemFieldLibraryGroupResponseDto["skipped"] = [];

    for (const fieldKey of group.fieldKeys) {
      const existingId = byKey.get(fieldKey);
      if (existingId != null) {
        skipped.push({
          key: fieldKey,
          workspaceFieldId: existingId,
          reason: "already_installed",
        });
        continue;
      }

      const result = await this.installSystemLibraryFieldForOwner(ownerId, {
        key: fieldKey,
        groupKey: group.key,
      });
      installed.push(result.field);
      byKey.set(fieldKey, result.field.id);
    }

    return {
      groupKey: group.key,
      installed,
      skipped,
    };
  }

  async listDefinitionsForWorkspace(
    workspaceId: number,
  ): Promise<WorkspaceVariantCustomField[]> {
    const rows = await this.fieldRepo.find({
      where: { workspaceId, archivedAt: IsNull() },
      relations: { fieldOptions: true },
      order: { sortOrder: "ASC", id: "ASC" },
    });
    for (const row of rows) {
      row.fieldOptions = (row.fieldOptions ?? []).filter(
        (option) => option.archivedAt == null,
      );
    }
    return rows;
  }

  /** Resolve field definitions by id (includes archived) for list filters. */
  async listDefinitionsByIdsForWorkspace(
    workspaceId: number,
    fieldIds: number[],
  ): Promise<WorkspaceVariantCustomField[]> {
    const unique = [...new Set(fieldIds.filter((id) => id > 0))];
    if (unique.length === 0) {
      return [];
    }
    return this.fieldRepo.find({
      where: { workspaceId, id: In(unique) },
    });
  }

  async assertOptionIdsBelongToField(
    fieldId: number,
    optionIds: number[],
  ): Promise<void> {
    if (optionIds.length === 0) {
      return;
    }
    const count = await this.optionRepo.count({
      where: { fieldId, id: In(optionIds) },
    });
    if (count !== optionIds.length) {
      throw new BadRequestException(
        `One or more option ids do not belong to characteristic field ${fieldId}`,
      );
    }
  }

  async createForOwner(
    ownerId: number,
    dto: CreateVariantCustomFieldDto,
  ): Promise<VariantCustomFieldDefinitionDto> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    await this.productAuthz.requireCharacteristicsManage(
      ownerId,
      undefined,
      workspace.id,
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
        displayName: dto.displayName?.trim() || null,
        type: dto.type,
        sortOrder: dto.sortOrder ?? 0,
        archivedAt: null,
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
    await this.productAuthz.requireCharacteristicsManage(
      ownerId,
      undefined,
      row.workspaceId,
    );

    if (dto.label !== undefined) {
      row.label = dto.label;
    }
    if (dto.displayName !== undefined) {
      row.displayName =
        dto.displayName == null ? null : dto.displayName.trim() || null;
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
    await this.productAuthz.requireCharacteristicsManage(
      ownerId,
      undefined,
      row.workspaceId,
    );
    const usage = await this.valueRepo.count({ where: { fieldId: row.id } });
    if (usage > 0) {
      throw new ConflictException(
        "Custom field is in use and cannot be deleted; archive it instead",
      );
    }
    await this.fieldRepo.remove(row);
  }

  async archiveForOwner(
    ownerId: number,
    fieldId: number,
  ): Promise<VariantCustomFieldDefinitionDto> {
    const row = await this.requireOwnedField(ownerId, fieldId);
    await this.productAuthz.requireCharacteristicsManage(
      ownerId,
      undefined,
      row.workspaceId,
    );
    const now = new Date();
    if (row.archivedAt == null) {
      row.archivedAt = now;
      await this.fieldRepo.save(row);
    }
    await this.optionRepo
      .createQueryBuilder()
      .update(WorkspaceVariantCustomFieldOption)
      .set({ archivedAt: now })
      .where("field_id = :fieldId", { fieldId: row.id })
      .andWhere("archived_at IS NULL")
      .execute();
    return this.toDto(await this.requireFieldWithOptions(row.id));
  }

  async unarchiveForOwner(
    ownerId: number,
    fieldId: number,
  ): Promise<VariantCustomFieldDefinitionDto> {
    const row = await this.requireOwnedField(ownerId, fieldId);
    await this.productAuthz.requireCharacteristicsManage(
      ownerId,
      undefined,
      row.workspaceId,
    );
    if (row.archivedAt != null) {
      row.archivedAt = null;
      await this.fieldRepo.save(row);
    }
    return this.toDto(await this.requireFieldWithOptions(row.id));
  }

  async archiveOptionForOwner(
    ownerId: number,
    fieldId: number,
    optionId: number,
  ): Promise<VariantCustomFieldOptionDto> {
    const option = await this.requireOwnedOption(ownerId, fieldId, optionId);
    if (option.archivedAt == null) {
      option.archivedAt = new Date();
      await this.optionRepo.save(option);
    }
    return this.toOptionDto(option);
  }

  async unarchiveOptionForOwner(
    ownerId: number,
    fieldId: number,
    optionId: number,
  ): Promise<VariantCustomFieldOptionDto> {
    const field = await this.requireOwnedField(ownerId, fieldId);
    if (field.archivedAt != null) {
      throw new BadRequestException(
        "Cannot unarchive an option while its field is archived; unarchive the field first",
      );
    }
    const option = await this.requireOwnedOption(ownerId, fieldId, optionId);
    if (option.archivedAt != null) {
      option.archivedAt = null;
      await this.optionRepo.save(option);
    }
    return this.toOptionDto(option);
  }

  async addOptionForOwner(
    ownerId: number,
    fieldId: number,
    label: string,
  ): Promise<WorkspaceVariantCustomFieldOption> {
    const field = await this.requireOwnedField(ownerId, fieldId);
    if (field.archivedAt != null) {
      throw new BadRequestException("Cannot add options to an archived field");
    }
    if (field.type !== VariantCustomFieldType.options) {
      throw new BadRequestException("Field is not an options type");
    }

    const existing = await this.findOptionByNormalizedLabel(
      this.optionRepo,
      field.id,
      label,
    );
    if (existing) {
      if (existing.archivedAt != null) {
        throw new ConflictException(
          "An archived option with this label exists; unarchive it instead",
        );
      }
      return existing;
    }

    await this.productAuthz.requireCharacteristicsManage(
      ownerId,
      undefined,
      field.workspaceId,
    );

    return this.optionRepo.save(
      this.optionRepo.create({
        fieldId: field.id,
        label: label.trim(),
        archivedAt: null,
      }),
    );
  }

  async updateOptionForOwner(
    ownerId: number,
    fieldId: number,
    optionId: number,
    label: string,
  ): Promise<WorkspaceVariantCustomFieldOption> {
    const field = await this.requireOwnedField(ownerId, fieldId);
    await this.productAuthz.requireCharacteristicsManage(
      ownerId,
      undefined,
      field.workspaceId,
    );
    if (field.type !== VariantCustomFieldType.options) {
      throw new BadRequestException("Field is not an options type");
    }

    const option = await this.optionRepo.findOne({ where: { id: optionId } });
    if (!option || option.fieldId !== field.id) {
      throw new NotFoundException("Option not found for this field");
    }

    const normalized = normalizeCustomFieldOptionValue(label);
    if (!normalized) {
      throw new BadRequestException("value must not be empty");
    }

    const duplicate = await this.findOptionByNormalizedLabel(
      this.optionRepo,
      field.id,
      label,
    );
    if (duplicate && duplicate.id !== option.id) {
      throw new ConflictException("Another option with the same label exists");
    }

    option.label = label.trim();
    return this.optionRepo.save(option);
  }

  async deleteOptionForOwner(
    ownerId: number,
    fieldId: number,
    optionId: number,
  ): Promise<void> {
    const field = await this.requireOwnedField(ownerId, fieldId);
    await this.productAuthz.requireCharacteristicsManage(
      ownerId,
      undefined,
      field.workspaceId,
    );
    if (field.type !== VariantCustomFieldType.options) {
      throw new BadRequestException("Field is not an options type");
    }

    const option = await this.optionRepo.findOne({ where: { id: optionId } });
    if (!option || option.fieldId !== field.id) {
      throw new NotFoundException("Option not found for this field");
    }

    const usage = await this.valueRepo.count({
      where: { optionId: option.id },
    });
    if (usage > 0) {
      throw new ConflictException(
        "Option is in use and cannot be deleted; archive it instead",
      );
    }

    await this.optionRepo.remove(option);
  }

  async getUsageForOwner(
    ownerId: number,
    fieldId: number,
  ): Promise<
    import("./dto/variant-custom-field-usage.dto").VariantCustomFieldUsageDto
  > {
    const field = await this.requireOwnedField(ownerId, fieldId);
    const totalProducts = await this.countProductsUsingField(field.id);

    if (field.type === VariantCustomFieldType.options) {
      const options = await this.optionRepo.find({
        where: { fieldId: field.id },
        order: { id: "ASC" },
      });
      const rawCounts = await this.valueRepo
        .createQueryBuilder("v")
        .leftJoin("v.variant", "variant")
        .select("v.option_id", "option_id")
        .addSelect("COUNT(DISTINCT variant.product_id)", "product_count")
        .addSelect("COUNT(*)", "variant_count")
        .where("v.field_id = :fieldId", { fieldId: field.id })
        .andWhere("v.option_id IS NOT NULL")
        .groupBy("v.option_id")
        .getRawMany();

      const countsMap = new Map<
        number,
        { productCount: number; productVariantCount: number }
      >();
      for (const row of rawCounts) {
        countsMap.set(Number(row.option_id), {
          productCount: Number(row.product_count),
          productVariantCount: Number(row.variant_count),
        });
      }
      const optionUsages = options.map((option) => {
        const counts = countsMap.get(option.id) ?? {
          productCount: 0,
          productVariantCount: 0,
        };
        return {
          optionId: option.id,
          label: option.label,
          archivedAt: option.archivedAt?.toISOString() ?? null,
          productCount: counts.productCount,
          productVariantCount: counts.productVariantCount,
        };
      });

      return {
        id: field.id,
        key: field.key,
        label: field.label,
        displayName: field.displayName?.trim() || null,
        type: field.type,
        archivedAt: field.archivedAt?.toISOString() ?? null,
        totalProducts,
        options: optionUsages,
      };
    }

    const topTextValues = await this.valueRepo
      .createQueryBuilder("v")
      .leftJoin("v.variant", "variant")
      .select("v.text_value", "value")
      .addSelect("COUNT(DISTINCT variant.product_id)", "product_count")
      .addSelect("COUNT(*)", "product_variant_count")
      .where("v.field_id = :fieldId", { fieldId: field.id })
      .andWhere("v.text_value IS NOT NULL")
      .andWhere("v.text_value <> ''")
      .groupBy("v.text_value")
      .orderBy("product_variant_count", "DESC")
      .addOrderBy("v.text_value", "ASC")
      .limit(10)
      .getRawMany();

    return {
      id: field.id,
      key: field.key,
      label: field.label,
      displayName: field.displayName?.trim() || null,
      type: field.type,
      archivedAt: field.archivedAt?.toISOString() ?? null,
      totalProducts,
      topTextValues: topTextValues.map((row) => ({
        value: row.value as string,
        productCount: Number(row.product_count),
        productVariantCount: Number(row.product_variant_count),
      })),
    };
  }

  private async countProductsUsingField(fieldId: number): Promise<number> {
    const raw = await this.valueRepo
      .createQueryBuilder("v")
      .leftJoin("v.variant", "variant")
      .select("COUNT(DISTINCT variant.product_id)", "count")
      .where("v.field_id = :fieldId", { fieldId })
      .getRawOne();

    return Number(raw?.count ?? 0);
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
    for (let i = 0; i < attributes.length; i++) {
      const item = attributes[i];
      const displayValue = item.value.trim();
      if (!displayValue) {
        continue;
      }
      const sortOrder = item.order ?? i;

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
          sortOrder,
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
          sortOrder,
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
    for (let i = 0; i < values.length; i++) {
      const { fieldId, value } = values[i];
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
          sortOrder: i,
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
          sortOrder: i,
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
          sortOrder: row.sortOrder,
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

    await this.productAuthz.requireCharacteristicsManage(
      ownerId,
      undefined,
      workspaceId,
    );

    const storageType = apiTypeToStorageType(apiType);
    const created = await fieldRepo.save(
      fieldRepo.create({
        workspaceId,
        key,
        label: name,
        displayName: null,
        type: storageType,
        sortOrder: await this.nextFieldSortOrder(workspaceId, fieldRepo),
        archivedAt: null,
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

    if (field.archivedAt != null) {
      throw new BadRequestException(
        `Custom field "${field.key}" is archived; cannot create new options`,
      );
    }

    await this.productAuthz.requireCharacteristicsManage(
      ownerId,
      undefined,
      workspaceId,
    );

    return optionRepo.save(
      optionRepo.create({
        fieldId: field.id,
        label,
        archivedAt: null,
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
          optionRepo.create({ fieldId, label, archivedAt: null }),
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
      where: { fieldId, archivedAt: IsNull() },
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

  private async requireOwnedOption(
    ownerId: number,
    fieldId: number,
    optionId: number,
  ): Promise<WorkspaceVariantCustomFieldOption> {
    const field = await this.requireOwnedField(ownerId, fieldId);
    await this.productAuthz.requireCharacteristicsManage(
      ownerId,
      undefined,
      field.workspaceId,
    );
    if (field.type !== VariantCustomFieldType.options) {
      throw new BadRequestException("Field is not an options type");
    }
    const option = await this.optionRepo.findOne({ where: { id: optionId } });
    if (!option || option.fieldId !== field.id) {
      throw new NotFoundException("Option not found for this field");
    }
    return option;
  }

  private validateOptionsForType(
    type: VariantCustomFieldType,
    options: string[] | undefined,
  ): void {
    if (type === VariantCustomFieldType.options) {
      // Allow creating options-type fields without initial options
      // Options can be added later via POST /workspace/variant-custom-fields/:id/option
      return;
    }
    if (options?.length) {
      throw new BadRequestException(
        "options must be omitted when type is text",
      );
    }
  }

  private toOptionDto(
    option: WorkspaceVariantCustomFieldOption,
  ): VariantCustomFieldOptionDto {
    return {
      id: option.id,
      label: option.label,
      archivedAt: option.archivedAt?.toISOString() ?? null,
    };
  }

  private toDto(
    row: WorkspaceVariantCustomField,
  ): VariantCustomFieldDefinitionDto {
    const options = [...(row.fieldOptions ?? [])]
      .sort((a, b) => a.id - b.id)
      .map((o) => this.toOptionDto(o));
    return {
      id: row.id,
      key: row.key,
      label: row.label,
      displayName: row.displayName?.trim() || null,
      type: row.type,
      ...(row.type === VariantCustomFieldType.options && options.length
        ? { options }
        : {}),
      sortOrder: row.sortOrder,
      archivedAt: row.archivedAt?.toISOString() ?? null,
    };
  }
}