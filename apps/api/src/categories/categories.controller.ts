import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  categorySchema,
  createCategoryRequestSchema,
  idParamSchema,
  mergeCategoryRequestSchema,
  mergeCategoryResponseSchema,
  updateCategoryRequestSchema,
  type Category,
  type MergeCategoryResponse,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CategoriesService } from './categories.service';

class CategoryDto extends createZodDto(categorySchema) {}
class CreateCategoryDto extends createZodDto(createCategoryRequestSchema) {}
class UpdateCategoryDto extends createZodDto(updateCategoryRequestSchema) {}
class IdParamDto extends createZodDto(idParamSchema) {}
class MergeCategoryDto extends createZodDto(mergeCategoryRequestSchema) {}
class MergeCategoryResponseDto extends createZodDto(mergeCategoryResponseSchema) {}
class ListQueryDto extends createZodDto(
  z.object({
    archived: z.enum(['true', 'false']).optional(),
    usage: z.enum(['true', 'false']).optional(),
  }),
) {}

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ZodSerializerDto([CategoryDto])
  list(@CurrentUser() user: AuthUser, @Query() query: ListQueryDto): Promise<Category[]> {
    return this.categories.list(user.id, query.archived === 'true', query.usage === 'true');
  }

  @Post()
  @ZodSerializerDto(CategoryDto)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateCategoryDto): Promise<Category> {
    return this.categories.create(user.id, body);
  }

  @Patch(':id')
  @ZodSerializerDto(CategoryDto)
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categories.update(user.id, params.id, body);
  }

  @Post(':id/merge')
  @HttpCode(200)
  @ZodSerializerDto(MergeCategoryResponseDto)
  merge(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: MergeCategoryDto,
  ): Promise<MergeCategoryResponse> {
    return this.categories.merge(user.id, params.id, body.targetId);
  }
}
