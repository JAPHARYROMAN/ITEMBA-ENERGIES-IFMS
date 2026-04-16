import React from 'react';
import { useTranslation } from 'react-i18next';
import { GenericTablePage } from './GenericTablePage';
import { saleRepo } from '../../lib/repositories';
import { permissionGroups } from '../../lib/permissions';
import { formatCurrency } from '../../lib/currency';
import type { Column } from '../ifms/DataTable';
import type { Sale } from '../../lib/models';

const columns: Column<Sale>[] = [
  { accessorKey: 'timestamp', header: 'Date', sortable: true },
  { accessorKey: 'productId', header: 'Product', sortable: true },
  { accessorKey: 'quantity', header: 'Quantity', sortable: true, cell: (r) => r.quantity.toLocaleString() },
  { accessorKey: 'totalAmount', header: 'Total', sortable: true, cell: (r) => formatCurrency(r.totalAmount) },
  { accessorKey: 'paymentType', header: 'Payment', sortable: true },
];

export default function SalesTransactionsPage() {
  const { t } = useTranslation();
  return (
    <GenericTablePage<Sale>
      title={t('sales.transactions', 'Sales Transactions')}
      description={t('sales.transactionsDesc', 'View all recorded sales')}
      queryKey={['sales-transactions']}
      queryFn={saleRepo.list}
      columns={columns}
      entityName="Transaction"
      writePermissions={permissionGroups.salesRead}
    />
  );
}
