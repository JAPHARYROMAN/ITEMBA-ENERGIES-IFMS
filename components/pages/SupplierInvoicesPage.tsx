import React from 'react';
import { useTranslation } from 'react-i18next';
import { GenericTablePage } from './GenericTablePage';
import { supplierInvoiceRepo } from '../../lib/repositories';
import { permissionGroups } from '../../lib/permissions';
import { formatCurrency } from '../../lib/currency';
import type { Column } from '../ifms/DataTable';

type InvoiceRow = Awaited<ReturnType<typeof supplierInvoiceRepo.list>>[number];

const columns: Column<InvoiceRow>[] = [
  { accessorKey: 'invoiceNumber', header: 'Invoice #', sortable: true },
  { accessorKey: 'supplierId', header: 'Supplier', sortable: true },
  { accessorKey: 'invoiceDate', header: 'Invoice Date', sortable: true },
  { accessorKey: 'dueDate', header: 'Due Date', sortable: true },
  { accessorKey: 'totalAmount', header: 'Total', sortable: true, cell: (r) => formatCurrency(r.totalAmount) },
  { accessorKey: 'balanceRemaining', header: 'Balance', sortable: true, cell: (r) => formatCurrency(r.balanceRemaining) },
  { accessorKey: 'status', header: 'Status', sortable: true },
];

export default function SupplierInvoicesPage() {
  const { t } = useTranslation();
  return (
    <GenericTablePage<InvoiceRow>
      title={t('payables.invoices', 'Supplier Invoices')}
      description={t('payables.invoicesDesc', 'Track invoices from suppliers')}
      queryKey={['supplier-invoices']}
      queryFn={supplierInvoiceRepo.list}
      columns={columns}
      entityName="Invoice"
      writePermissions={permissionGroups.payablesRead}
    />
  );
}
