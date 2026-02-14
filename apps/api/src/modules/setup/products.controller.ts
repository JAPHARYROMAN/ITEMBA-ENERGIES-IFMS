import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../auth/decorators/current-user.decorator';
import { BaseListController } from '../../common/base/base-list.controller';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import type { ListResponse } from '../../common/interfaces/response-envelope';
import { getListParams } from '../../common/helpers/list.helper';
import { ProductsService, type ProductItem } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@ApiTags('setup')
@Controller('products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class ProductsController extends BaseListController {
  constructor(private readonly productsService: ProductsService) {
    super();
  }

  @Get()
  @Permissions('setup:read', 'reports:read')
  @ApiOperation({ summary: 'List products' })
  @ApiResponse({ status: 200 })
  async list(@Query() query: ListQueryDto): Promise<ListResponse<ProductItem>> {
    const params = getListParams(query);
    const { data, total } = await this.productsService.findPage({
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      q: query.q,
      companyId: query.companyId,
    });
    return this.listResponse(data, total, { page: params.page, pageSize: params.pageSize });
  }

  @Get(':id')
  @Permissions('setup:read', 'reports:read')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async getById(@Param('id') id: string): Promise<ProductItem> {
    return this.productsService.findById(id);
  }

  @Post()
  @Permissions('setup:write')
  @ApiOperation({ summary: 'Create product' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409 })
  async create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<ProductItem> {
    return this.productsService.create(
      {
        companyId: dto.companyId,
        code: dto.code,
        name: dto.name,
        category: dto.category,
        pricePerUnit: dto.pricePerUnit,
        unit: dto.unit,
        status: dto.status,
      },
      { userId: user.sub, ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @Patch(':id')
  @Permissions('setup:write')
  @ApiOperation({ summary: 'Update product' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  @ApiResponse({ status: 409 })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<ProductItem> {
    return this.productsService.update(id, dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('setup:write')
  @ApiOperation({ summary: 'Soft-delete product' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404 })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<void> {
    await this.productsService.remove(id, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
