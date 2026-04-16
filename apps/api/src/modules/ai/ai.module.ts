import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiChatService } from './ai-chat.service';
import { ExportsModule } from '../exports/exports.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { CreditModule } from '../credit/credit.module';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [
    ExportsModule,
    NotificationsModule,
    DeliveriesModule,
    ExpensesModule,
    CreditModule,
    SalesModule,
  ],
  controllers: [AiController],
  providers: [AiService, AiChatService],
  exports: [AiService, AiChatService],
})
export class AiModule {}
