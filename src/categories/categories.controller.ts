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
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CategoriesService, type CategoryTreeNodeDto } from './categories.service';
import { CreateCategoryRequestDto } from './dto/create-category-request.dto';
import { UpdateCategoryRequestDto } from './dto/update-category-request.dto';

@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  async list(@Req() req: { user?: AuthUser }): Promise<CategoryTreeNodeDto[]> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.categories.findTreeForOwner(ownerId);
  }

  @Get(':id')
  async getById(
    @Req() req: { user?: AuthUser },
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CategoryTreeNodeDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.categories.findOneForOwner(ownerId, id);
  }

  @Post()
  async create(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateCategoryRequestDto,
  ): Promise<CategoryTreeNodeDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.categories.createForOwner(ownerId, dto);
  }

  @Patch(':id')
  async update(
    @Req() req: { user?: AuthUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryRequestDto,
  ): Promise<CategoryTreeNodeDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.categories.updateForOwner(ownerId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() req: { user?: AuthUser },
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    const ownerId = this.requireNumericOwnerId(req);
    await this.categories.removeForOwner(ownerId, id);
  }

  private requireNumericOwnerId(req: { user?: AuthUser }): number {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        'Current authorized user does not contain numeric owner id',
      );
    }
    return ownerId;
  }
}
