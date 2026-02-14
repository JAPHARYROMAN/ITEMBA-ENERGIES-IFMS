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
import { Throttle } from '@nestjs/throttler';
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
import { ExpensesService, type ExpenseCategoryItem, type ExpenseEntryItem, type PettyCashLedgerItem } from './expenses.service';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { CreateExpenseEntryDto } from './dto/create-expense-entry.dto';
import { CreatePettyCashTxDto } from './dto/create-petty-cash-tx.dto';
import { RejectExpenseEntryDto } from './dto/reject-expense-entry.dto';

@ApiTags('expenses')
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class ExpensesController extends BaseListController {
  constructor(private readonly expensesService: ExpensesService) {
    super();
  }

  @Get('expense-categories')
  @Permissions('expenses:read')
  @ApiOperation({ summary: 'List expense categories' })
  @ApiResponse({ status: 200 })
  async listCategories(
    @Query() query: ListQueryDto & { status?: string },
  ): Promise<ListResponse<ExpenseCategoryItem>> {
    const params = getListParams(query);
    const { data, total } = await this.expensesService.listExpenseCategories({
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      q: query.q,
      companyId: query.companyId,
      branchId: query.branchId,
      status: query.status,
    });
    return this.listResponse(data, total, { page: params.page, pageSize: params.pageSize });
  }

  @Get('expense-categories/:id')
  @Permissions('expenses:read')
  @ApiOperation({ summary: 'Get expense category by ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async getCategory(@Param('id') id: string): Promise<ExpenseCategoryItem> {
    return this.expensesService.getExpenseCategory(id);
  }

  @Post('expense-categories')
  @Permissions('expenses:write')
  @ApiOperation({ summary: 'Create expense category' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409 })
  async createCategory(
    @Body() dto: CreateExpenseCategoryDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<ExpenseCategoryItem> {
    return this.expensesService.createExpenseCategory(dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Patch('expense-categories/:id')
  @Permissions('expenses:write')
  @ApiOperation({ summary: 'Update expense category' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  @ApiResponse({ status: 409 })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseCategoryDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<ExpenseCategoryItem> {
    return this.expensesService.updateExpenseCategory(id, dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Delete('expense-categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('expenses:write')
  @ApiOperation({ summary: 'Soft-delete expense category' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404 })
  async deleteCategory(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<void> {
    await this.expensesService.deleteExpenseCategory(id, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('expense-entries')
  @Permissions('expenses:write')
  @ApiOperation({ summary: 'Create expense entry (draft)' })
  @ApiResponse({ status: 201 })
  async createEntry(
    @Body() dto: CreateExpenseEntryDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<ExpenseEntryItem> {
    return this.expensesService.createExpenseEntry(dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('expense-entries')
  @Permissions('expenses:read')
  @ApiOperation({ summary: 'List expense entries' })
  @ApiResponse({ status: 200 })
  async listEntries(
    @Query() query: ListQueryDto & { status?: string },
  ): Promise<ListResponse<ExpenseEntryItem>> {
    const params = getListParams(query);
    const { data, total } = await this.expensesService.listExpenseEntries({
      page: query.page,
      pageSize: query.pageSize,
      companyId: query.companyId,
      branchId: query.branchId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      q: query.q,
    });
    return this.listResponse(data, total, { page: params.page, pageSize: params.pageSize });
  }

  @Post('expense-entries/:id/submit')
  @Permissions('expenses:write')
  @ApiOperation({ summary: 'Submit expense entry for approval' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400 })
  @ApiResponse({ status: 404 })
  async submitEntry(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<ExpenseEntryItem> {
    return this.expensesService.submitExpenseEntry(id, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('expense-entries/:id/approve')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Permissions('expenses:write')
  @ApiOperation({ summary: 'Approve expense entry (Manager only)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  async approveEntry(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<ExpenseEntryItem> {
    return this.expensesService.approveExpenseEntry(id, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('expense-entries/:id/reject')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Permissions('expenses:write')
  @ApiOperation({ summary: 'Reject expense entry (Manager only, reason required)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  async rejectEntry(
    @Param('id') id: string,
    @Body() dto: RejectExpenseEntryDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<ExpenseEntryItem> {
    return this.expensesService.rejectExpenseEntry(id, dto.reason, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('petty-cash/topup')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Permissions('expenses:write')
  @ApiOperation({ summary: 'Top up petty cash' })
  @ApiResponse({ status: 201 })
  async topupPettyCash(
    @Body() dto: CreatePettyCashTxDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<PettyCashLedgerItem> {
    return this.expensesService.topupPettyCash(dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('petty-cash/spend')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Permissions('expenses:write')
  @ApiOperation({ summary: 'Spend from petty cash' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409, description: 'Insufficient petty cash balance' })
  async spendPettyCash(
    @Body() dto: CreatePettyCashTxDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ): Promise<PettyCashLedgerItem> {
    return this.expensesService.spendPettyCash(dto, {
      userId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('petty-cash/ledger')
  @Permissions('expenses:read')
  @ApiOperation({ summary: 'List petty cash ledger with derived balance' })
  @ApiResponse({ status: 200 })
  async listPettyCashLedger(
    @Query() query: ListQueryDto,
  ): Promise<ListResponse<PettyCashLedgerItem> & { balance: number }> {
    const params = getListParams(query);
    const { data, total, balance } = await this.expensesService.listPettyCashLedger({
      page: query.page,
      pageSize: query.pageSize,
      companyId: query.companyId,
      branchId: query.branchId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    return { ...this.listResponse(data, total, { page: params.page, pageSize: params.pageSize }), balance };
  }
}
