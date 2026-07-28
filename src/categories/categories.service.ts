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
import { ProductAuthorizationService } from "../workspace-access/product-authorization.service";
import type { CreateCategoryRequestDto } from "./dto/create-category-request.dto";
import type { MoveCategoryRequestDto } from "./dto/move-category-request.dto";
import type { UpdateCategoryRequestDto } from "./dto/update-category-request.dto";

/** Synthetic list node for products with `categoryId: null`. Not stored in DB. */
export const UNCATEGORIZED_CATEGORY_ID = -1;
export const UNCATEGORIZED_CATEGORY_NAME = "Без категорії";

export type CategoryTreeNodeDto = {
  id: number;
  name: string;
  parentId: number | null;
  sortOrder: number;
  createdByUserId: number;
  createdAt: Date;
  updatedAt: Date;
  /** Products assigned directly to this category. */
  productCount: number;
  /** Variants of products assigned directly to this category. */
  productVariantCount: number;
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
  productVariantCount: number;
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
  productVariantCount: number;
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
    private readonly productAuthz: ProductAuthorizationService,
  ) {}

  async findTreeForOwner(ownerId: number): Promise<CategoryTreeNodeDto[]> {
    await this.productAuthz.requireRead(ownerId);
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const rows = await this.categoryRepo.find({
      where: { workspaceId, deletedAt: IsNull() },
      order: { sortOrder: "ASC", name: "ASC" },
    });
    const [counts, uncategorized] = await Promise.all([
      this.countProductsAndVariantsByCategoryIds(
        workspaceId,
        rows.map((r) => r.id),
      ),
      this.countUncategorizedProductsAndVariants(workspaceId),
    ]);
    return [
      this.buildUncategorizedTreeNode(uncategorized),
      ...this.buildTree(rows, counts),
    ];
  }

  async findOneForOwner(
    ownerId: number,
    id: number,
  ): Promise<CategoryDetailDto> {
    if (id === UNCATEGORIZED_CATEGORY_ID) {
      await this.productAuthz.requireRead(ownerId);
      const workspaceId =
        await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
      const counts = await this.countUncategorizedProductsAndVariants(
        workspaceId,
      );
      return {
        id: UNCATEGORIZED_CATEGORY_ID,
        name: UNCATEGORIZED_CATEGORY_NAME,
        parentId: null,
        sortOrder: -1,
        createdByUserId: 0,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        productCount: counts.productCount,
        productVariantCount: counts.productVariantCount,
        subcategories: [],
      };
    }

    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const row = await this.categoryRepo.findOne({
      where: { id, workspaceId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException("Category not found");
    }

    const subcategoryRows = await this.categoryRepo.find({
      where: { workspaceId, parentId: id, deletedAt: IsNull() },
      order: { sortOrder: "ASC", name: "ASC" },
    });

    const categoryIds = [row.id, ...subcategoryRows.map((s) => s.id)];
    const counts = await this.countProductsAndVariantsByCategoryIds(
      workspaceId,
      categoryIds,
    );

    const productCount = counts.get(row.id)?.productCount ?? 0;
    const productVariantCount = counts.get(row.id)?.productVariantCount ?? 0;
    const subcategories: CategorySubcategoryDto[] = subcategoryRows.map(
      (sub) => ({
        id: sub.id,
        name: sub.name,
        parentId: sub.parentId as number,
        sortOrder: sub.sortOrder,
        createdByUserId: sub.createdByUserId,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
        productCount: counts.get(sub.id)?.productCount ?? 0,
        productVariantCount: counts.get(sub.id)?.productVariantCount ?? 0,
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
      productVariantCount,
      subcategories,
    };
  }

  private async countProductsAndVariantsByCategoryIds(
    workspaceId: number,
    categoryIds: number[],
  ): Promise<
    Map<number, { productCount: number; productVariantCount: number }>
  > {
    if (categoryIds.length === 0) {
      return new Map();
    }
    const rows = await this.productRepo
      .createQueryBuilder("p")
      .select("p.categoryId", "categoryId")
      .addSelect("COUNT(*)::int", "product_count")
      .addSelect("COUNT(v.id)::int", "product_variant_count")
      .leftJoin("product_variants", "v", "v.product_id = p.id")
      .where("p.workspaceId = :workspaceId", { workspaceId })
      .andWhere("p.categoryId IN (:...categoryIds)", { categoryIds })
      .groupBy("p.categoryId")
      .getRawMany<{
        categoryId: number;
        product_count: number;
        product_variant_count: number;
      }>();

    return new Map(
      rows.map((r) => [
        Number(r.categoryId),
        {
          productCount: Number(r.product_count),
          productVariantCount: Number(r.product_variant_count),
        },
      ]),
    );
  }

  private async countUncategorizedProductsAndVariants(
    workspaceId: number,
  ): Promise<{ productCount: number; productVariantCount: number }> {
    const row = await this.productRepo
      .createQueryBuilder("p")
      .select("COUNT(*)::int", "product_count")
      .addSelect("COUNT(v.id)::int", "product_variant_count")
      .leftJoin("product_variants", "v", "v.product_id = p.id")
      .where("p.workspaceId = :workspaceId", { workspaceId })
      .andWhere("p.categoryId IS NULL")
      .getRawOne<{
        product_count: number;
        product_variant_count: number;
      }>();

    return {
      productCount: Number(row?.product_count ?? 0),
      productVariantCount: Number(row?.product_variant_count ?? 0),
    };
  }

  private buildUncategorizedTreeNode(counts: {
    productCount: number;
    productVariantCount: number;
  }): CategoryTreeNodeDto {
    return {
      id: UNCATEGORIZED_CATEGORY_ID,
      name: UNCATEGORIZED_CATEGORY_NAME,
      parentId: null,
      sortOrder: -1,
      createdByUserId: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      productCount: counts.productCount,
      productVariantCount: counts.productVariantCount,
      children: [],
    };
  }

  async createForOwner(
    ownerId: number,
    dto: CreateCategoryRequestDto,
  ): Promise<CategoryDetailDto> {
    await this.productAuthz.requireCategoryManage(ownerId);
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("name is required");
    }
    const sortOrder = dto.sortOrder ?? 0;
    const parentId = dto.parentId ?? null;

    if (parentId === UNCATEGORIZED_CATEGORY_ID) {
      throw new BadRequestException(
        "Cannot use uncategorized category as parent",
      );
    }

    if (parentId) {
      await this.requireExistingParent(workspaceId, parentId);
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
    if (id === UNCATEGORIZED_CATEGORY_ID) {
      throw new BadRequestException("Uncategorized category cannot be updated");
    }
    await this.productAuthz.requireCategoryManage(ownerId);
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
      await this.applyParentChange(workspaceId, row, dto.parentId);
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

  /**
   * Move a category under another category (or to top level when parentId is null).
   * Children move with the subtree; cycles are rejected.
   */
  async moveForOwner(
    ownerId: number,
    id: number,
    dto: MoveCategoryRequestDto,
  ): Promise<CategoryDetailDto> {
    if (id === UNCATEGORIZED_CATEGORY_ID) {
      throw new BadRequestException("Uncategorized category cannot be moved");
    }
    await this.productAuthz.requireCategoryManage(ownerId);
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const row = await this.categoryRepo.findOne({
      where: { id, workspaceId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException("Category not found");
    }

    const newParentId = dto.parentId ?? null;
    if (row.parentId === newParentId) {
      return this.findOneForOwner(ownerId, row.id);
    }

    await this.applyParentChange(workspaceId, row, newParentId);
    await this.assertUniqueNameAmongSiblings(
      workspaceId,
      row.parentId,
      row.name,
      row.id,
    );
    await this.categoryRepo.save(row);
    return this.findOneForOwner(ownerId, row.id);
  }

  private async applyParentChange(
    workspaceId: number,
    row: ProductCategory,
    newParentId: number | null,
  ): Promise<void> {
    if (newParentId === UNCATEGORIZED_CATEGORY_ID) {
      throw new BadRequestException(
        "Cannot use uncategorized category as parent",
      );
    }
    if (newParentId === row.id) {
      throw new BadRequestException(
        "Cannot set parentId: that would create a cycle in the category hierarchy",
      );
    }
    if (newParentId !== null) {
      await this.assertNoCycleWhenReparenting(row.id, newParentId);
      await this.requireExistingParent(workspaceId, newParentId);
    }
    row.parentId = newParentId;
  }

  async removeForOwner(ownerId: number, id: number): Promise<void> {
    if (id === UNCATEGORIZED_CATEGORY_ID) {
      throw new BadRequestException("Uncategorized category cannot be removed");
    }
    await this.productAuthz.requireCategoryManage(ownerId);
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const row = await this.categoryRepo.findOne({
      where: { id, workspaceId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException("Category not found");
    }

    const allRows = await this.categoryRepo.find({
      where: { workspaceId, deletedAt: IsNull() },
      select: { id: true, parentId: true },
    });
    const deleteIds = this.collectDescendantIds(allRows, id);

    await this.productRepo
      .createQueryBuilder()
      .update(Product)
      .set({ categoryId: null })
      .where("workspace_id = :workspaceId", { workspaceId })
      .andWhere("category_id IN (:...deleteIds)", { deleteIds })
      .execute();

    const now = new Date();
    await this.categoryRepo
      .createQueryBuilder()
      .update(ProductCategory)
      .set({ deletedAt: now, deletedByUserId: ownerId })
      .where("workspace_id = :workspaceId", { workspaceId })
      .andWhere("id IN (:...deleteIds)", { deleteIds })
      .andWhere("deleted_at IS NULL")
      .execute();
  }

  /** Root id plus every descendant (depth-first via adjacency map). */
  private collectDescendantIds(
    rows: Array<{ id: number; parentId: number | null }>,
    rootId: number,
  ): number[] {
    const childrenByParent = new Map<number, number[]>();
    for (const row of rows) {
      if (row.parentId == null) {
        continue;
      }
      const list = childrenByParent.get(row.parentId) ?? [];
      list.push(row.id);
      childrenByParent.set(row.parentId, list);
    }

    const result: number[] = [];
    const stack = [rootId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      result.push(current);
      const children = childrenByParent.get(current);
      if (children?.length) {
        for (const childId of children) {
          stack.push(childId);
        }
      }
    }
    return result;
  }

  private buildTree(
    rows: ProductCategory[],
    counts: Map<number, { productCount: number; productVariantCount: number }>,
  ): CategoryTreeNodeDto[] {
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

    const toDto = (row: ProductCategory): CategoryTreeNodeDto => {
      const count = counts.get(row.id) ?? {
        productCount: 0,
        productVariantCount: 0,
      };
      return {
        id: row.id,
        name: row.name,
        parentId: row.parentId,
        sortOrder: row.sortOrder,
        createdByUserId: row.createdByUserId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        productCount: count.productCount,
        productVariantCount: count.productVariantCount,
        children: (byParent.get(row.id) ?? []).map(toDto),
      };
    };

    const roots = byParent.get(null) ?? [];
    return roots.map(toDto);
  }

  /**
   * Parent must exist in the workspace (any depth).
   */
  private async requireExistingParent(
    workspaceId: number,
    parentId: number,
  ): Promise<ProductCategory> {
    const parent = await this.categoryRepo.findOne({
      where: { id: parentId, workspaceId, deletedAt: IsNull() },
    });
    if (!parent) {
      throw new NotFoundException("Parent category not found");
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
