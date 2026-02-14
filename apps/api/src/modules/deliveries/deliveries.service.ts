import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { deliveries } from '../../database/schema/deliveries/deliveries';
import { grns } from '../../database/schema/deliveries/grns';
import { grnAllocations } from '../../database/schema/deliveries/grn-allocations';
import { branches } from '../../database/schema/core/branches';
import { stations } from '../../database/schema/core/stations';
import { tanks } from '../../database/schema/setup/tanks';
import { stockLedger } from '../../database/schema/inventory/stock-ledger';
import { getListParams } from '../../common/helpers/list.helper';
import { AuditService } from '../audit/audit.service';
import type { CreateDeliveryDto } from './dto/create-delivery.dto';
import type { ReceiveGrnDto } from './dto/receive-grn.dto';

type Schema = typeof schema;

const DELIVERY_STATUS_PENDING = 'pending';
const DELIVERY_STATUS_COMPLETED = 'completed';

export interface DeliveryItem {
  id: string;
  companyId: string;
  branchId: string;
  deliveryNote: string;
  supplierId: string | null;
  vehicleNo: string | null;
  driverName: string | null;
  productId: string | null;
  orderedQty: string;
  expectedDate: Date;
  receivedQty: string | null;
  density: string | null;
  temperature: string | null;
  status: string;
  createdAt: Date;
}

export interface DeliveryDetail extends DeliveryItem {
  grn?: {
    id: string;
    grnNumber: string;
    receivedQty: string;
    receivedAt: Date;
    density: string | null;
    temperature: string | null;
    varianceReason: string | null;
    allocations: { tankId: string; quantity: string }[];
  };
}

export interface DeliveriesListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
  companyId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface AuditContext {
  userId: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class DeliveriesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async findPage(params: DeliveriesListParams): Promise<{ data: DeliveryItem[]; total: number }> {
    const { offset, limit, page, pageSize } = getListParams(params);
    const conditions = [isNull(deliveries.deletedAt)];
    if (params.branchId) conditions.push(eq(deliveries.branchId, params.branchId));
    if (params.companyId) conditions.push(eq(deliveries.companyId, params.companyId));
    if (params.status) conditions.push(eq(deliveries.status, params.status));
    if (params.dateFrom) conditions.push(sql`${deliveries.expectedDate} >= ${params.dateFrom}::timestamptz`);
    if (params.dateTo) conditions.push(sql`${deliveries.expectedDate} <= ${params.dateTo}::timestamptz`);
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: deliveries.id,
          companyId: deliveries.companyId,
          branchId: deliveries.branchId,
          deliveryNote: deliveries.deliveryNote,
          supplierId: deliveries.supplierId,
          vehicleNo: deliveries.vehicleNo,
          driverName: deliveries.driverName,
          productId: deliveries.productId,
          orderedQty: deliveries.orderedQty,
          expectedDate: deliveries.expectedDate,
          receivedQty: deliveries.receivedQty,
          density: deliveries.density,
          temperature: deliveries.temperature,
          status: deliveries.status,
          createdAt: deliveries.createdAt,
        })
        .from(deliveries)
        .where(w)
        .orderBy(desc(deliveries.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(deliveries).where(w),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
  }

  async findById(id: string): Promise<DeliveryDetail> {
    const [row] = await this.db
      .select({
        id: deliveries.id,
        companyId: deliveries.companyId,
        branchId: deliveries.branchId,
        deliveryNote: deliveries.deliveryNote,
        supplierId: deliveries.supplierId,
        vehicleNo: deliveries.vehicleNo,
        driverName: deliveries.driverName,
        productId: deliveries.productId,
        orderedQty: deliveries.orderedQty,
        expectedDate: deliveries.expectedDate,
        receivedQty: deliveries.receivedQty,
        density: deliveries.density,
        temperature: deliveries.temperature,
        status: deliveries.status,
        createdAt: deliveries.createdAt,
      })
      .from(deliveries)
      .where(and(eq(deliveries.id, id), isNull(deliveries.deletedAt)));
    if (!row) throw new NotFoundException('Delivery not found');

    const [grnRow] = await this.db
      .select()
      .from(grns)
      .where(eq(grns.deliveryId, id));
    let grn: DeliveryDetail['grn'];
    if (grnRow) {
      const allocs = await this.db
        .select({ tankId: grnAllocations.tankId, quantity: grnAllocations.quantity })
        .from(grnAllocations)
        .where(eq(grnAllocations.grnId, grnRow.id));
      grn = {
        id: grnRow.id,
        grnNumber: grnRow.grnNumber,
        receivedQty: grnRow.receivedQty,
        receivedAt: grnRow.receivedAt,
        density: grnRow.density,
        temperature: grnRow.temperature,
        varianceReason: grnRow.varianceReason,
        allocations: allocs.map((a) => ({ tankId: a.tankId, quantity: a.quantity })),
      };
    }
    return { ...row, grn };
  }

  async create(dto: CreateDeliveryDto, ctx: AuditContext): Promise<DeliveryItem> {
    const [branch] = await this.db
      .select({ id: branches.id, stationId: branches.stationId })
      .from(branches)
      .where(and(eq(branches.id, dto.branchId), isNull(branches.deletedAt)));
    if (!branch) throw new NotFoundException('Branch not found');

    const [station] = await this.db
      .select({ id: stations.id, companyId: stations.companyId })
      .from(stations)
      .where(and(eq(stations.id, branch.stationId), isNull(stations.deletedAt)));
    if (!station) throw new NotFoundException('Station not found');

    const [inserted] = await this.db
      .insert(deliveries)
      .values({
        companyId: station.companyId,
        branchId: dto.branchId,
        deliveryNote: dto.deliveryNote.trim(),
        supplierId: dto.supplierId ?? null,
        vehicleNo: dto.vehicleNo?.trim() || null,
        driverName: dto.driverName?.trim() || null,
        productId: dto.productId ?? null,
        orderedQty: String(dto.orderedQty),
        expectedDate: new Date(dto.expectedDate),
        status: DELIVERY_STATUS_PENDING,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning({
        id: deliveries.id,
        companyId: deliveries.companyId,
        branchId: deliveries.branchId,
        deliveryNote: deliveries.deliveryNote,
        supplierId: deliveries.supplierId,
        vehicleNo: deliveries.vehicleNo,
        driverName: deliveries.driverName,
        productId: deliveries.productId,
        orderedQty: deliveries.orderedQty,
        expectedDate: deliveries.expectedDate,
        receivedQty: deliveries.receivedQty,
        density: deliveries.density,
        temperature: deliveries.temperature,
        status: deliveries.status,
        createdAt: deliveries.createdAt,
      });
    if (!inserted) throw new Error('Failed to insert delivery');
    await this.audit.log({
      entity: 'deliveries',
      entityId: inserted.id,
      action: 'create',
      after: inserted as object,
      userId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return inserted;
  }

  async receiveGrn(deliveryId: string, dto: ReceiveGrnDto, ctx: AuditContext): Promise<DeliveryDetail> {
    const varianceThreshold = this.config.get<number>('DELIVERY_VARIANCE_REQUIRE_REASON_THRESHOLD', 0);

    const allocationSum = dto.allocations.reduce((s, a) => s + a.quantity, 0);
    const receivedQty = dto.receivedQty;
    if (Math.abs(allocationSum - receivedQty) > 1e-6) {
      throw new BadRequestException(
        `GRN allocations must sum exactly to received qty: got ${allocationSum}, expected ${receivedQty}`,
      );
    }

    await this.db.transaction(async (tx) => {
      const [delivery] = await tx
        .select()
        .from(deliveries)
        .where(and(eq(deliveries.id, deliveryId), isNull(deliveries.deletedAt)));
      if (!delivery) throw new NotFoundException('Delivery not found');
      if (delivery.status === DELIVERY_STATUS_COMPLETED) {
        throw new BadRequestException('Delivery already received');
      }

      const orderedQty = Number(delivery.orderedQty);
      const variance = Math.abs(orderedQty - receivedQty);
      if (variance > varianceThreshold && (!dto.varianceReason || !dto.varianceReason.trim())) {
        throw new BadRequestException(
          `Variance (${orderedQty - receivedQty}) exceeds threshold ${varianceThreshold}; variance reason is required`,
        );
      }

      for (const alloc of dto.allocations) {
        const [tank] = await tx
          .select({
            id: tanks.id,
            branchId: tanks.branchId,
            productId: tanks.productId,
            capacity: tanks.capacity,
            currentLevel: tanks.currentLevel,
          })
          .from(tanks)
          .where(and(eq(tanks.id, alloc.tankId), isNull(tanks.deletedAt)));
        if (!tank) throw new NotFoundException(`Tank ${alloc.tankId} not found`);
        if (tank.branchId !== delivery.branchId) {
          throw new BadRequestException(`Tank ${alloc.tankId} does not belong to delivery branch`);
        }
        if (delivery.productId && tank.productId !== delivery.productId) {
          throw new BadRequestException(`Tank ${alloc.tankId} product does not match delivery product`);
        }
        const capacity = Number(tank.capacity);
        const current = Number(tank.currentLevel || 0);
        const free = capacity - current;
        if (alloc.quantity > free) {
          throw new BadRequestException(
            `Tank ${alloc.tankId} free capacity is ${free}; cannot allocate ${alloc.quantity}`,
          );
        }
      }

      const grnNumber = `GRN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const receivedAt = new Date();
      const [grn] = await tx
        .insert(grns)
        .values({
          deliveryId,
          grnNumber,
          receivedQty: String(receivedQty.toFixed(3)),
          receivedAt,
          density: dto.density != null ? String(dto.density) : null,
          temperature: dto.temperature != null ? String(dto.temperature) : null,
          varianceReason: dto.varianceReason?.trim() || null,
          status: 'posted',
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({ id: grns.id });

      if (!grn) throw new Error('Failed to insert GRN');

      for (const alloc of dto.allocations) {
        await tx.insert(grnAllocations).values({
          grnId: grn.id,
          tankId: alloc.tankId,
          quantity: String(alloc.quantity.toFixed(3)),
        });
      }

      for (const alloc of dto.allocations) {
        const [tank] = await tx
          .select({ id: tanks.id, branchId: tanks.branchId, productId: tanks.productId, currentLevel: tanks.currentLevel })
          .from(tanks)
          .where(eq(tanks.id, alloc.tankId));
        if (tank) {
          const newLevel = Number(tank.currentLevel || 0) + alloc.quantity;
          await tx.update(tanks).set({
            currentLevel: String(newLevel.toFixed(3)),
            updatedAt: receivedAt,
            updatedBy: ctx.userId,
          }).where(eq(tanks.id, alloc.tankId));
          await tx.insert(stockLedger).values({
            companyId: delivery.companyId,
            branchId: tank.branchId,
            tankId: alloc.tankId,
            productId: tank.productId,
            movementType: 'grn',
            referenceType: 'grn',
            referenceId: grn.id,
            quantity: String(alloc.quantity.toFixed(3)),
            movementDate: receivedAt,
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          });
        }
      }

      await tx
        .update(deliveries)
        .set({
          receivedQty: String(receivedQty.toFixed(3)),
          density: dto.density != null ? String(dto.density) : null,
          temperature: dto.temperature != null ? String(dto.temperature) : null,
          status: DELIVERY_STATUS_COMPLETED,
          updatedAt: receivedAt,
          updatedBy: ctx.userId,
        })
        .where(eq(deliveries.id, deliveryId));

      await this.audit.log(
        {
          entity: 'grns',
          entityId: grn.id,
          action: 'create',
          after: { id: grn.id, grnNumber, receivedQty, deliveryId } as object,
          userId: ctx.userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx as NodePgDatabase<Schema>,
      );
      await this.audit.log(
        {
          entity: 'deliveries',
          entityId: deliveryId,
          action: 'receive_grn',
          before: delivery as object,
          after: { status: DELIVERY_STATUS_COMPLETED, receivedQty } as object,
          userId: ctx.userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx as NodePgDatabase<Schema>,
      );
    });
    return this.findById(deliveryId);
  }
}
