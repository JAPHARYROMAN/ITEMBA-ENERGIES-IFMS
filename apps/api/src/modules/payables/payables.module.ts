import { Module } from '@nestjs/common';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { SupplierStatementService } from './supplier-statement.service';
import { SupplierInvoicesController } from './supplier-invoices.controller';
import { SupplierInvoicesService } from './supplier-invoices.service';
import { SupplierPaymentsController } from './supplier-payments.controller';
import { SupplierPaymentsService } from './supplier-payments.service';
import { PayablesController } from './payables.controller';
import { PayablesAgingService } from './payables-aging.service';

@Module({
  controllers: [
    SuppliersController,
    SupplierInvoicesController,
    SupplierPaymentsController,
    PayablesController,
  ],
  providers: [
    SuppliersService,
    SupplierStatementService,
    SupplierInvoicesService,
    SupplierPaymentsService,
    PayablesAgingService,
  ],
  exports: [
    SuppliersService,
    SupplierInvoicesService,
    SupplierPaymentsService,
    SupplierStatementService,
    PayablesAgingService,
  ],
})
export class PayablesModule {}
