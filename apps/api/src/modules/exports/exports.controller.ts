import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createReadStream } from 'node:fs';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser, type JwtPayloadUser } from '../auth/decorators/current-user.decorator';
import { CreateExportDto } from './dto/create-export.dto';
import { ListExportsQueryDto } from './dto/list-exports-query.dto';
import { ExportIdParamDto } from './dto/export-id-param.dto';
import { VerifyReportQueryDto } from './dto/verify-report-query.dto';
import { ExportsService } from './exports.service';
import { SetLegalHoldDto } from './dto/set-legal-hold.dto';

@ApiTags('exports')
@Controller('exports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Queue an export (PDF/CSV)' })
  @ApiResponse({ status: 201, description: 'Export queued successfully' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  create(@Body() dto: CreateExportDto, @CurrentUser() user: JwtPayloadUser, @Req() req: Request) {
    return this.exportsService.createExport(dto, user, {
      actorUserId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get()
  @Permissions('reports:read')
  @ApiOperation({ summary: 'List export history' })
  @ApiResponse({ status: 200, description: 'Paginated list of exports' })
  list(@Query() query: ListExportsQueryDto, @CurrentUser() user: JwtPayloadUser) {
    return this.exportsService.listExports(user, query);
  }

  @Get(':exportId')
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Get export metadata/status' })
  @ApiResponse({ status: 200, description: 'Export metadata returned' })
  @ApiResponse({ status: 404, description: 'Export not found' })
  getOne(@Param() params: ExportIdParamDto, @CurrentUser() user: JwtPayloadUser) {
    return this.exportsService.getExport(user, params.exportId);
  }

  @Get(':exportId/download')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Download export file' })
  @ApiResponse({ status: 200, description: 'File stream returned' })
  @ApiResponse({ status: 404, description: 'Export file not found' })
  async download(
    @Param() params: ExportIdParamDto,
    @CurrentUser() user: JwtPayloadUser,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.exportsService.getDownloadMeta(user, params.exportId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Content-Length', String(file.sizeBytes));
    createReadStream(file.filePath).pipe(res);
  }

  @Get(':exportId/verification-receipt')
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Download verification receipt PDF' })
  @ApiResponse({ status: 200, description: 'Verification receipt PDF' })
  async verificationReceipt(
    @Param() params: ExportIdParamDto,
    @CurrentUser() user: JwtPayloadUser,
    @Res() res: Response,
  ): Promise<void> {
    const receipt = await this.exportsService.getVerificationReceiptPdf(user, params.exportId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${params.exportId}-verification-receipt.pdf"`,
    );
    res.setHeader('Content-Length', String(receipt.length));
    res.send(receipt);
  }

  @Patch(':exportId/legal-hold')
  @Permissions('reports:refresh')
  @ApiOperation({ summary: 'Enable or disable legal hold on export' })
  @ApiResponse({ status: 200, description: 'Legal hold updated' })
  @ApiResponse({ status: 404, description: 'Export not found' })
  setLegalHold(
    @Param() params: ExportIdParamDto,
    @Body() body: SetLegalHoldDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ) {
    return this.exportsService.setLegalHold(user, params.exportId, body.enabled, body.reason, {
      actorUserId: user.sub,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}

@ApiTags('public-report-verification')
@Controller('public/report')
export class PublicReportVerificationController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get('verify')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify exported report by token' })
  @ApiResponse({ status: 200, description: 'Report verification result' })
  @ApiResponse({ status: 400, description: 'Token is required' })
  async verify(@Query() query: VerifyReportQueryDto, @Req() req: Request, @Res() res: Response) {
    const wantsHtml =
      (req.headers.accept ?? '').includes('text/html') &&
      !(req.headers.accept ?? '').includes('application/json');
    if (wantsHtml) {
      const html = await this.exportsService.buildPublicVerificationPage(query.token);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      return;
    }

    if (!query.token) {
      throw new BadRequestException('token is required');
    }

    res.json(await this.exportsService.verifyByToken(query.token));
  }

  @Get('verify/receipt')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Download public verification receipt by token' })
  @ApiResponse({ status: 200, description: 'Verification receipt PDF' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async downloadVerificationReceipt(
    @Query() query: VerifyReportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    if (!query.token) {
      throw new BadRequestException('token is required');
    }

    const verification = await this.exportsService.verifyByToken(query.token);
    if (!verification.valid) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    const receipt = await this.exportsService.getVerificationReceiptPdfByToken(query.token);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="verification-${query.token.slice(0, 12)}.pdf"`,
    );
    res.setHeader('Content-Length', String(receipt.length));
    res.send(receipt);
  }
}
