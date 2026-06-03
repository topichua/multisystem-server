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
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import {
  CategoriesService,
  type CategoryDetailDto,
  type CategoryTreeNodeDto,
} from "./categories.service";
import { CreateCategoryRequestDto } from "./dto/create-category-request.dto";
import { UpdateCategoryRequestDto } from "./dto/update-category-request.dto";

@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  async list(@Req() req: { user?: AuthUser }): Promise<CategoryTreeNodeDto[]> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.categories.findTreeForOwner(ownerId);
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get category",
    description:
      "Returns the category with subcategories (for top-level parents), " +
      "productCount (products assigned directly to this category), and totalProductCount " +
      "(direct + all subcategories).",
  })
  async getById(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<CategoryDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.categories.findOneForOwner(ownerId, id);
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

  @Delete(":parentId/subcategories/:subcategoryId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete subcategory",
    description:
      "Soft-deletes a subcategory under the given top-level parent. " +
      "Use DELETE /categories/:id only for top-level categories (without subcategories).",
  })
  async removeSubcategory(
    @Req() req: { user?: AuthUser },
    @Param("parentId", ParseIntPipe) parentId: number,
    @Param("subcategoryId", ParseIntPipe) subcategoryId: number,
  ): Promise<void> {
    const ownerId = this.requireNumericOwnerId(req);
    await this.categories.removeSubcategoryForOwner(
      ownerId,
      parentId,
      subcategoryId,
    );
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete category",
    description:
      "Soft-deletes a category. Top-level categories must have no subcategories. " +
      "Subcategories may also be removed via DELETE /categories/:parentId/subcategories/:subcategoryId.",
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
