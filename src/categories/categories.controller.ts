import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import {
  CategoriesService,
  type CategoryDetailDto,
  type CategoryTreeNodeDto,
} from "./categories.service";
import { CreateCategoryRequestDto } from "./dto/create-category-request.dto";
import { ListCategoriesQueryDto } from "./dto/list-categories-query.dto";
import { MoveCategoryRequestDto } from "./dto/move-category-request.dto";
import { UpdateCategoryRequestDto } from "./dto/update-category-request.dto";

@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary: "List category tree",
    description:
      "Full category tree for the workspace. The first node is always synthetic " +
      "`Без категорії` with `id: -1` (products with `categoryId: null`); it cannot be deleted. " +
      "Pass `withCounters=true` (default) for `productCount` (distinct products assigned to the category) " +
      "and `productVariantCount` (variants of those products). Pass `withCounters=false` to skip count queries.",
  })
  async list(
    @Req() req: { user?: AuthUser },
    @Query() query: ListCategoriesQueryDto,
  ): Promise<CategoryTreeNodeDto[]> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.categories.findTreeForOwner(
      ownerId,
      query.withCounters !== false,
    );
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get category",
    description:
      "Returns the category with its direct child categories. " +
      "`withCounters` defaults to `true` (`productCount` / `productVariantCount`). Pass `false` to skip.",
  })
  async getById(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Query() query: ListCategoriesQueryDto,
  ): Promise<CategoryDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.categories.findOneForOwner(
      ownerId,
      id,
      query.withCounters !== false,
    );
  }

  @Post()
  async create(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateCategoryRequestDto,
  ): Promise<CategoryDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.categories.createForOwner(ownerId, dto);
  }

  @Patch(":id")
  async update(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryRequestDto,
  ): Promise<CategoryDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.categories.updateForOwner(ownerId, id, dto);
  }

  @Post(":id/move")
  @ApiOperation({
    summary: "Move category under another category",
    description:
      "Reparents the category. Pass `parentId` to nest under that category, or `null`/omit for top level. " +
      "The whole subtree moves with it. Moving under a descendant (cycle) is rejected. " +
      "Synthetic category `id: -1` cannot be moved or used as parent.",
  })
  @ApiBody({ type: MoveCategoryRequestDto })
  @ApiOkResponse({ description: "Updated category detail." })
  async move(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: MoveCategoryRequestDto,
  ): Promise<CategoryDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.categories.moveForOwner(ownerId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete category",
    description:
      "Soft-deletes the category and all of its descendants (cascade). " +
      "Products assigned to any deleted category get `categoryId: null` (uncategorized). " +
      "Synthetic category `id: -1` (`Без категорії`) cannot be removed.",
  })
  async remove(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<void> {
    const ownerId = this.requireNumericOwnerId(req);
    await this.categories.removeForOwner(ownerId, id);
  }

  private requireNumericOwnerId(req: { user?: AuthUser }): number {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return ownerId;
  }
}
