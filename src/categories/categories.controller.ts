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
  @ApiOperation({
    summary: "List category tree",
    description:
      "Full category tree for the workspace. Each node includes `productCount` and `productVariantCount` " +
      "for products assigned directly to that category.",
  })
  async list(@Req() req: { user?: AuthUser }): Promise<CategoryTreeNodeDto[]> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.categories.findTreeForOwner(ownerId);
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get category",
    description:
      "Returns the category with its direct child categories. " +
      "`productCount` / `productVariantCount` count products and variants assigned directly to each category.",
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

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete category",
    description:
      "Soft-deletes the category and all of its descendants (cascade). " +
      "Products assigned to any deleted category get `categoryId: null` (uncategorized).",
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
