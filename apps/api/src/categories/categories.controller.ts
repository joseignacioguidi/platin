import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  categorySchema,
  createCategoryRequestSchema,
  idParamSchema,
  updateCategoryRequestSchema,
  type Category,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CategoriesService } from './categories.service';

class CategoryDto extends createZodDto(categorySchema) {}
class CreateCategoryDto extends createZodDto(createCategoryRequestSchema) {}
class UpdateCategoryDto extends createZodDto(updateCategoryRequestSchema) {}
class IdParamDto extends createZodDto(idParamSchema) {}
class ListQueryDto extends createZodDto(
  z.object({ archived: z.enum(['true', 'false']).optional() }),
) {}

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ZodSerializerDto([CategoryDto])
  list(@CurrentUser() user: AuthUser, @Query() query: ListQueryDto): Promise<Category[]> {
    return this.categories.list(user.id, query.archived === 'true');
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
}
