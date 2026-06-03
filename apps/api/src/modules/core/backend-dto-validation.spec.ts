import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { CreateCreditInvoiceDto } from '../credit/dto/create-credit-invoice.dto';
import { CreateCustomerDto } from '../credit/dto/create-customer.dto';
import { CreatePaymentDto } from '../credit/dto/create-payment.dto';
import { CustomerActionDto } from '../credit/dto/customer-action.dto';
import { CustomerNoteDto } from '../credit/dto/customer-note.dto';
import { UpdateCreditInvoiceDto } from '../credit/dto/update-credit-invoice.dto';
import { UpdateCustomerDto } from '../credit/dto/update-customer.dto';
import { CreateDeliveryDto } from '../deliveries/dto/create-delivery.dto';
import { ReceiveGrnDto } from '../deliveries/dto/receive-grn.dto';
import { UpdateDeliveryDto } from '../deliveries/dto/update-delivery.dto';
import { CreateSupplierInvoiceDto } from '../payables/dto/create-supplier-invoice.dto';
import { CreateSupplierPaymentDto } from '../payables/dto/create-supplier-payment.dto';
import { CreateSupplierDto } from '../payables/dto/create-supplier.dto';
import { UpdateSupplierInvoiceDto } from '../payables/dto/update-supplier-invoice.dto';
import { UpdateSupplierDto } from '../payables/dto/update-supplier.dto';
import { CreatePosSaleDto } from '../sales/dto/create-pos-sale.dto';
import { VoidTransactionDto } from '../sales/dto/void-transaction.dto';
import { CreateNozzleDto } from '../setup/dto/create-nozzle.dto';
import { CreateProductDto } from '../setup/dto/create-product.dto';
import { CreatePumpDto } from '../setup/dto/create-pump.dto';
import { CreateTankDto } from '../setup/dto/create-tank.dto';
import { UpdateNozzleDto } from '../setup/dto/update-nozzle.dto';
import { UpdateProductDto } from '../setup/dto/update-product.dto';
import { UpdatePumpDto } from '../setup/dto/update-pump.dto';
import { UpdateTankDto } from '../setup/dto/update-tank.dto';
import { CloseShiftDto } from '../shifts/dto/close-shift.dto';
import { OpenShiftDto } from '../shifts/dto/open-shift.dto';
import { CreateAdjustmentDto } from '../transfers/dto/create-adjustment.dto';
import { StationToStationTransferDto } from '../transfers/dto/station-to-station-transfer.dto';
import { TankToTankTransferDto } from '../transfers/dto/tank-to-tank-transfer.dto';
import { TransfersListQueryDto } from '../transfers/dto/transfers-list-query.dto';
import { UpdateTransferDto } from '../transfers/dto/update-transfer.dto';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

async function errorsFor<T extends object>(cls: new () => T, payload: object): Promise<string[]> {
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance as object);
  return errors.map((error) => error.property);
}

describe('backend DTO validation for covered business modules', () => {
  describe('core DTOs', () => {
    it('accepts valid create payloads and rejects enum/UUID violations', async () => {
      expect(await errorsFor(CreateCompanyDto, { code: 'ACME', name: 'Acme', currency: 'USD', status: 'active' }))
        .toEqual([]);
      expect(await errorsFor(CreateStationDto, {
        companyId: UUID,
        code: 'ST01',
        name: 'Station',
        location: 'Nairobi',
        manager: 'Manager',
        status: 'inactive',
      })).toEqual([]);
      expect(await errorsFor(CreateBranchDto, { stationId: UUID, code: 'BR01', name: 'Branch', status: 'active' }))
        .toEqual([]);
      expect(await errorsFor(CreateBranchDto, { stationId: 'bad', code: 'B'.repeat(33), name: 'Branch' }))
        .toEqual(expect.arrayContaining(['stationId', 'code']));
      expect(await errorsFor(CreateCompanyDto, { code: 'ACME', name: 'Acme', status: 'archived' })).toContain(
        'status',
      );
    });

    it('validates optional update payloads', async () => {
      expect(await errorsFor(UpdateCompanyDto, {})).toEqual([]);
      expect(await errorsFor(UpdateStationDto, { companyId: UUID, manager: 'M' })).toEqual([]);
      expect(await errorsFor(UpdateBranchDto, { stationId: 'bad', status: 'archived' })).toEqual(
        expect.arrayContaining(['stationId', 'status']),
      );
    });
  });

  describe('setup DTOs', () => {
    it('validates create DTOs and numeric transforms', async () => {
      expect(await errorsFor(CreateNozzleDto, {
        stationId: UUID,
        pumpId: UUID,
        tankId: UUID,
        productId: UUID,
        code: 'N1',
      })).toEqual([]);
      const product = plainToInstance(CreateProductDto, {
        companyId: UUID,
        code: 'PMS',
        name: 'Petrol',
        category: 'fuel',
        pricePerUnit: '180.5',
        unit: 'L',
      });
      expect(product.pricePerUnit).toBe(180.5);
      expect(await validate(product as object)).toEqual([]);
      expect(await errorsFor(CreatePumpDto, { stationId: UUID, code: 'P1', status: 'inactive' })).toEqual([]);
      const tank = plainToInstance(CreateTankDto, {
        companyId: UUID,
        branchId: UUID,
        productId: UUID,
        code: 'T1',
        capacity: '10000',
        minLevel: '500',
        maxLevel: '9500',
        currentLevel: '2500',
      });
      expect(tank.capacity).toBe(10000);
      expect(await validate(tank as object)).toEqual([]);
    });

    it('validates setup update DTO optional constraints', async () => {
      expect(await errorsFor(UpdateNozzleDto, { pumpId: 'bad' })).toContain('pumpId');
      expect(await errorsFor(UpdateProductDto, { pricePerUnit: '-1' })).toContain('pricePerUnit');
      expect(await errorsFor(UpdatePumpDto, { code: 'P'.repeat(33) })).toContain('code');
      expect(await errorsFor(UpdateTankDto, { capacity: '-1', status: 'archived' })).toEqual(
        expect.arrayContaining(['capacity', 'status']),
      );
    });
  });

  describe('sales and shifts DTOs', () => {
    it('validates POS sales with nested items and payment splits', async () => {
      const instance = plainToInstance(CreatePosSaleDto, {
        branchId: UUID,
        shiftId: UUID,
        items: [{ productId: UUID, nozzleId: UUID, quantity: '2.5', unitPrice: '180', taxAmount: '1' }],
        payments: [{ paymentMethod: 'Cash', amount: '450' }],
        discountAmount: '5',
        discountReason: '<b>manager approved</b>',
      });

      expect(instance.items[0].quantity).toBe(2.5);
      expect(instance.discountReason).toBe('manager approved');
      expect(await validate(instance as object)).toEqual([]);
      expect(await errorsFor(CreatePosSaleDto, {
        branchId: UUID,
        items: [{ productId: UUID, nozzleId: UUID, quantity: 0, unitPrice: 1 }],
        payments: [{ paymentMethod: 'Crypto', amount: 1 }],
      })).toEqual(expect.arrayContaining(['items', 'payments']));
    });

    it('validates void and shift payloads', async () => {
      expect(await errorsFor(VoidTransactionDto, { reason: 'customer request' })).toEqual([]);
      expect(await errorsFor(VoidTransactionDto, { reason: '' })).toContain('reason');

      const openShift = plainToInstance(OpenShiftDto, {
        branchId: UUID,
        openingMeterReadings: [{ nozzleId: UUID, value: '12.5', pricePerUnit: '180' }],
      });
      expect(openShift.openingMeterReadings[0].value).toBe(12.5);
      expect(await validate(openShift as object)).toEqual([]);

      const closeShift = plainToInstance(CloseShiftDto, {
        closingMeterReadings: [{ nozzleId: UUID, value: '20' }],
        collections: [{ paymentMethod: 'MobileMoney', amount: '1000' }],
        varianceReason: 'rounding',
      });
      expect(closeShift.collections[0].amount).toBe(1000);
      expect(await validate(closeShift as object)).toEqual([]);
      expect(await errorsFor(CloseShiftDto, {
        closingMeterReadings: [{ nozzleId: UUID, value: -1 }],
        collections: [{ paymentMethod: 'Crypto', amount: -1 }],
      })).toEqual(expect.arrayContaining(['closingMeterReadings', 'collections']));
    });
  });

  describe('credit DTOs', () => {
    it('validates customer, invoice, payment, note, and action payloads', async () => {
      expect(await errorsFor(CreateCustomerDto, {
        branchId: UUID,
        code: 'C001',
        name: 'Customer',
        email: 'a@example.com',
        phone: '+255700000000',
        address: 'Street',
        taxId: 'TIN',
        creditLimit: 1000,
        paymentTerms: 'net30',
      })).toEqual([]);
      expect(await errorsFor(UpdateCustomerDto, { creditLimit: -1 })).toContain('creditLimit');

      const invoice = plainToInstance(CreateCreditInvoiceDto, {
        customerId: UUID,
        invoiceDate: '2026-01-01',
        dueDate: '2026-01-31',
        items: [{ productId: UUID, quantity: '2', unitPrice: '10', tax: '1' }],
      });
      expect(invoice.items[0].quantity).toBe(2);
      expect(await validate(invoice as object)).toEqual([]);
      expect(await errorsFor(UpdateCreditInvoiceDto, { dueDate: '2026-02-01', totalAmount: '20' })).toEqual([]);

      const payment = plainToInstance(CreatePaymentDto, {
        customerId: UUID,
        amount: '10',
        method: 'bank_transfer',
        paymentDate: '2026-01-02',
        referenceNo: 'REF',
        allocations: [{ invoiceId: UUID, amount: '10' }],
      });
      expect(payment.allocations?.[0].amount).toBe(10);
      expect(await validate(payment as object)).toEqual([]);
      expect(await errorsFor(CreatePaymentDto, { customerId: UUID, amount: 1, method: 'crypto' })).toContain(
        'method',
      );
      expect(await errorsFor(CustomerNoteDto, { note: 'follow up' })).toEqual([]);
      expect(await errorsFor(CustomerActionDto, { action: 'escalate-legal', payload: {}, note: 'late' })).toEqual([]);
      expect(await errorsFor(CustomerActionDto, { action: 'archive' })).toContain('action');
    });
  });

  describe('deliveries, payables, and transfers DTOs', () => {
    it('validates delivery and GRN payloads', async () => {
      const delivery = plainToInstance(CreateDeliveryDto, {
        branchId: UUID,
        deliveryNote: 'DN-1',
        supplierId: UUID,
        vehicleNo: 'KAA-001',
        driverName: 'Driver',
        productId: UUID,
        orderedQty: '1000',
        expectedDate: '2026-01-01',
      });
      expect(delivery.orderedQty).toBe(1000);
      expect(await validate(delivery as object)).toEqual([]);
      expect(await errorsFor(UpdateDeliveryDto, { orderedQty: '-1', expectedDate: 'bad' })).toEqual(
        expect.arrayContaining(['orderedQty', 'expectedDate']),
      );

      const grn = plainToInstance(ReceiveGrnDto, {
        receivedQty: '980',
        density: '0.82',
        temperature: '27',
        allocations: [{ tankId: UUID, quantity: '980' }],
        varianceReason: 'short load',
      });
      expect(grn.allocations[0].quantity).toBe(980);
      expect(await validate(grn as object)).toEqual([]);
    });

    it('validates supplier invoice, payment, and supplier DTOs', async () => {
      const invoice = plainToInstance(CreateSupplierInvoiceDto, {
        branchId: UUID,
        supplierId: UUID,
        invoiceNumber: 'INV-1',
        invoiceDate: '2026-01-01',
        dueDate: '2026-01-31',
        totalAmount: '500',
      });
      expect(invoice.totalAmount).toBe(500);
      expect(await validate(invoice as object)).toEqual([]);
      expect(await errorsFor(UpdateSupplierInvoiceDto, { invoiceNumber: 'I'.repeat(65), totalAmount: '0' }))
        .toEqual(expect.arrayContaining(['invoiceNumber', 'totalAmount']));

      const payment = plainToInstance(CreateSupplierPaymentDto, {
        branchId: UUID,
        supplierId: UUID,
        amount: '250',
        method: 'cash',
        paymentDate: '2026-02-01',
        referenceNo: 'PAY-1',
        allocations: [{ invoiceId: UUID, amount: '250' }],
      });
      expect(payment.allocations?.[0].amount).toBe(250);
      expect(await validate(payment as object)).toEqual([]);
      expect(await errorsFor(CreateSupplierDto, { companyId: UUID, code: 'SUP', name: 'Supplier' })).toEqual([]);
      expect(await errorsFor(UpdateSupplierDto, { rating: 'R'.repeat(33) })).toContain('rating');
    });

    it('validates transfer and adjustment DTOs', async () => {
      const adjustment = plainToInstance(CreateAdjustmentDto, {
        branchId: UUID,
        tankId: UUID,
        volumeDelta: '-10.5',
        reason: '<b>dip correction</b>',
        notes: '<p>checked</p>',
        adjustmentDate: '2026-01-01',
      });
      expect(adjustment.volumeDelta).toBe(-10.5);
      expect(adjustment.reason).toBe('dip correction');
      expect(adjustment.notes).toBe('checked');
      expect(await validate(adjustment as object)).toEqual([]);

      const tankTransfer = plainToInstance(TankToTankTransferDto, {
        fromTankId: UUID,
        toTankId: UUID,
        quantity: '50',
        transferDate: '2026-01-02',
        reference: 'TT-1',
      });
      expect(tankTransfer.quantity).toBe(50);
      expect(await validate(tankTransfer as object)).toEqual([]);
      expect(await errorsFor(StationToStationTransferDto, {
        fromTankId: UUID,
        toTankId: UUID,
        quantity: 0,
      })).toContain('quantity');
      expect(await errorsFor(TransfersListQueryDto, { transferType: 'x'.repeat(51) })).toContain('transferType');
      expect(await errorsFor(UpdateTransferDto, { reference: 'R'.repeat(129) })).toContain('reference');
    });
  });
});
