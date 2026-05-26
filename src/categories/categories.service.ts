import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, Repository } from "typeorm";
import { ProductCategory } from "../database/entities";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import type { CreateCategoryRequestDto } from "./dto/create-category-request.dto";
import type { UpdateCategoryRequestDto } from "./dto/update-category-request.dto";

export type CategoryTreeNodeDto = {
  id: number;
  name: string;
  parentId: number | null;
  sortOrder: number;
  createdByUserId: number;
  createdAt: Date;
  updatedAt: Date;
  children: CategoryTreeNodeDto[];
};

function compareCategoriesForSort(
  a: ProductCategory,
  b: ProductCategory,
): number {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }
  return a.name.localeCompare(b.name);
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(ProductCategory)
    private readonly categoryRepo: Repository<ProductCategory>,
    private readonly workspaceContext: WorkspaceAccessContextService,
  ) {}

  async findTreeForOwner(ownerId: number): Promise<CategoryTreeNodeDto[]> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const rows = await this.categoryRepo.find({
      where: { workspaceId, deletedAt: IsNull() },
      order: { sortOrder: "ASC", name: "ASC" },
    });
    return this.buildTree(rows);
  }

  async findOneForOwner(
    ownerId: number,
    id: number,
  ): Promise<CategoryTreeNodeDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const row = await this.categoryRepo.findOne({
      where: { id, workspaceId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException("Category not found");
    }
    const rows = await this.categoryRepo.find({
      where: { workspaceId, deletedAt: IsNull() },
      order: { sortOrder: "ASC", name: "ASC" },
    });
    const tree = this.buildTree(rows);
    const found = this.findNodeInForest(tree, id);
    if (!found) {
      throw new NotFoundException("Category not found");
    }
    return found;
  }

  async createForOwner(
    ownerId: number,
    dto: CreateCategoryRequestDto,
  ): Promise<CategoryTreeNodeDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("name is required");
    }
    const sortOrder = dto.sortOrder ?? 0;
    const parentId = dto.parentId ?? null;

    if (parentId) {
      await this.requireExistingTopLevelParent(workspaceId, parentId);
    }

    await this.assertUniqueNameAmongSiblings(
      workspaceId,
      parentId,
      name,
      undefined,
    );

    const row = this.categoryRepo.create({
      workspaceId,
      name,
      parentId,
      sortOrder,
      createdByUserId: ownerId,
      deletedAt: null,
      deletedByUserId: null,
    });
    await this.categoryRepo.save(row);
    return this.findOneForOwner(ownerId, row.id);
  }

  async updateForOwner(
    ownerId: number,
    id: number,
    dto: UpdateCategoryRequestDto,
  ): Promise<CategoryTreeNodeDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const row = await this.categoryRepo.findOne({
      where: { id, workspaceId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException("Category not found");
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException("name must not be empty");
      }
      row.name = name;
    }

    if (dto.sortOrder !== undefined) {
      row.sortOrder = dto.sortOrder;
    }

    if (dto.parentId !== undefined) {
      const newParentId = dto.parentId;
      if (newParentId === id) {
        throw new BadRequestException(
          "Cannot set parentId: that would create a cycle in the category hierarchy",
        );
      }
      if (newParentId !== null) {
        await this.assertNoCycleWhenReparenting(id, newParentId);
        await this.requireExistingTopLevelParent(workspaceId, newParentId);
        const childCount = await this.categoryRepo.count({
          where: { workspaceId, parentId: id, deletedAt: IsNull() },
        });
        if (childCount > 0) {
          throw new BadRequestException(
            "Cannot set a parent category when this category has subcategories; maximum hierarchy depth is two levels",
          );
        }
      }
      row.parentId = newParentId;
    }

    await this.assertUniqueNameAmongSiblings(
      workspaceId,
      row.parentId,
      row.name,
      row.id,
    );

    await this.categoryRepo.save(row);
    return this.findOneForOwner(ownerId, row.id);
  }

  async removeForOwner(ownerId: number, id: number): Promise<void> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const row = await this.categoryRepo.findOne({
      where: { id, workspaceId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException("Category not found");
    }

    const childCount = await this.categoryRepo.count({
      where: { workspaceId, parentId: id, deletedAt: IsNull() },
    });
    if (childCount > 0) {
      throw new ConflictException(
        "Cannot delete a category that has child categories",
      );
    }

    row.deletedAt = new Date();
    row.deletedByUserId = ownerId;
    await this.categoryRepo.save(row);
  }

  private findNodeInForest(
    forest: CategoryTreeNodeDto[],
    id: number,
  ): CategoryTreeNodeDto | null {
    for (const node of forest) {
      if (node.id === id) return node;
      const nested = this.findNodeInForest(node.children, id);
      if (nested) return nested;
    }
    return null;
  }

  private buildTree(rows: ProductCategory[]): CategoryTreeNodeDto[] {
    const byParent = new Map<number | null, ProductCategory[]>();
    for (const r of rows) {
      const key = r.parentId;
      const list = byParent.get(key) ?? [];
      list.push(r);
      byParent.set(key, list);
    }
    for (const list of byParent.values()) {
      list.sort(compareCategoriesForSort);
    }

    const toDto = (row: ProductCategory): CategoryTreeNodeDto => ({
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      sortOrder: row.sortOrder,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      children: (byParent.get(row.id) ?? []).map(toDto),
    });

    const roots = byParent.get(null) ?? [];
    return roots.map(toDto);
  }

  /**
   * Parent must exist in the workspace and be a top-level category (`parent_id` IS NULL).
   */
  private async requireExistingTopLevelParent(
    workspaceId: number,
    parentId: number,
  ): Promise<ProductCategory> {
    const parent = await this.categoryRepo.findOne({
      where: { id: parentId, workspaceId, deletedAt: IsNull() },
    });
    if (!parent) {
      throw new NotFoundException("Parent category not found");
    }
    if (parent.parentId !== null) {
      throw new BadRequestException(
        "Only top-level categories can be parents; maximum hierarchy depth is two levels",
      );
    }
    return parent;
  }

  private async assertNoCycleWhenReparenting(
    categoryId: number,
    newParentId: number,
  ): Promise<void> {
    let currentId: number | null = newParentId;
    while (currentId) {
      if (currentId === categoryId) {
        throw new BadRequestException(
          "Cannot set parentId: that would create a cycle in the category hierarchy",
        );
      }
      const node = await this.categoryRepo.findOne({
        where: { id: currentId, deletedAt: IsNull() },
        select: { parentId: true },
      });
      currentId = node?.parentId ?? null;
    }
  }

  private async assertUniqueNameAmongSiblings(
    workspaceId: number,
    parentId: number | null,
    name: string,
    excludeCategoryId: number | undefined,
  ): Promise<void> {
    const where =
      parentId === null
        ? {
            workspaceId,
            parentId: IsNull(),
            name,
            deletedAt: IsNull(),
            ...(excludeCategoryId ? { id: Not(excludeCategoryId) } : {}),
          }
        : {
            workspaceId,
            parentId,
            name,
            deletedAt: IsNull(),
            ...(excludeCategoryId ? { id: Not(excludeCategoryId) } : {}),
          };

    const dup = await this.categoryRepo.exist({ where });
    if (dup) {
      throw new ConflictException(
        "A category with this name already exists under the same parent",
      );
    }
  }
}
