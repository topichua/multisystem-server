import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, Repository } from "typeorm";
import { Product, ProductCategory } from "../database/entities";
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

export type CategorySubcategoryDto = {
  id: number;
  name: string;
  parentId: number;
  sortOrder: number;
  createdByUserId: number;
  createdAt: Date;
  updatedAt: Date;
  productCount: number;
};

export type CategoryDetailDto = {
  id: number;
  name: string;
  parentId: number | null;
  sortOrder: number;
  createdByUserId: number;
  createdAt: Date;
  updatedAt: Date;
  /** Products assigned directly to this category (not subcategories). */
  productCount: number;
  subcategories: CategorySubcategoryDto[];
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
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
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
  ): Promise<CategoryDetailDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const row = await this.categoryRepo.findOne({
      where: { id, workspaceId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException("Category not found");
    }

    const subcategoryRows =
      row.parentId === null
        ? await this.categoryRepo.find({
            where: { workspaceId, parentId: id, deletedAt: IsNull() },
            order: { sortOrder: "ASC", name: "ASC" },
          })
        : [];

    const categoryIds = [row.id, ...subcategoryRows.map((s) => s.id)];
    const productCounts = await this.countProductsByCategoryIds(
      workspaceId,
      categoryIds,
    );

    const productCount = productCounts.get(row.id) ?? 0;
    const subcategories: CategorySubcategoryDto[] = subcategoryRows.map(
      (sub) => ({
        id: sub.id,
        name: sub.name,
        parentId: sub.parentId as number,
        sortOrder: sub.sortOrder,
        createdByUserId: sub.createdByUserId,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
        productCount: productCounts.get(sub.id) ?? 0,
      }),
    );
    return {
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      sortOrder: row.sortOrder,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      productCount,
      subcategories,
    };
  }

  private async countProductsByCategoryIds(
    workspaceId: number,
    categoryIds: number[],
  ): Promise<Map<number, number>> {
    if (categoryIds.length === 0) {
      return new Map();
    }
    const rows = await this.productRepo
      .createQueryBuilder("p")
      .select("p.categoryId", "categoryId")
      .addSelect("COUNT(*)::int", "count")
      .where("p.workspaceId = :workspaceId", { workspaceId })
      .andWhere("p.categoryId IN (:...categoryIds)", { categoryIds })
      .groupBy("p.categoryId")
      .getRawMany<{ categoryId: number; count: number }>();

    return new Map(rows.map((r) => [Number(r.categoryId), Number(r.count)]));
  }

  async createForOwner(
    ownerId: number,
    dto: CreateCategoryRequestDto,
  ): Promise<CategoryDetailDto> {
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
  ): Promise<CategoryDetailDto> {
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

    await this.softDeleteCategory(row, ownerId);
  }

  async removeSubcategoryForOwner(
    ownerId: number,
    parentId: number,
    subcategoryId: number,
  ): Promise<void> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    await this.requireExistingTopLevelParent(workspaceId, parentId);

    const row = await this.categoryRepo.findOne({
      where: {
        id: subcategoryId,
        workspaceId,
        parentId,
        deletedAt: IsNull(),
      },
    });
    if (!row) {
      throw new NotFoundException("Subcategory not found");
    }

    await this.softDeleteCategory(row, ownerId);
  }

  private async softDeleteCategory(
    row: ProductCategory,
    ownerId: number,
  ): Promise<void> {
    row.deletedAt = new Date();
    row.deletedByUserId = ownerId;
    await this.categoryRepo.save(row);
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
