import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CreditStatementService } from './credit-statement.service';
import { CreditInvoicesController } from './credit-invoices.controller';
import { CreditInvoicesService } from './credit-invoices.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { CreditController } from './credit.controller';
import { CreditAgingService } from './credit-aging.service';

@Module({
  controllers: [
    CustomersController,
    CreditInvoicesController,
    PaymentsController,
    CreditController,
  ],
  providers: [
    CustomersService,
    CreditStatementService,
    CreditInvoicesService,
    PaymentsService,
    CreditAgingService,
  ],
  exports: [
    CustomersService,
    CreditInvoicesService,
    PaymentsService,
    CreditStatementService,
    CreditAgingService,
  ],
})
export class CreditModule {}
