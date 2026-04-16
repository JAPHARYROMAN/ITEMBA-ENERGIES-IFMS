import React from 'react';
import { useTranslation } from 'react-i18next';
import { GenericTablePage } from './GenericTablePage';
import { supplierRepo } from '../../lib/repositories';
import { permissionGroups } from '../../lib/permissions';
import type { Column } from '../ifms/DataTable';
import type { Supplier } from '../../lib/models';

const columns: Column<Supplier>[] = [
  { accessorKey: 'name', header: 'Name', sortable: true },
  { accessorKey: 'category', header: 'Category', sortable: true },
  { accessorKey: 'rating', header: 'Rating', sortable: true },
  { accessorKey: 'avgVariance', header: 'Avg Variance', cell: (r) => r.avgVariance.toFixed(2) },
];

export default function SuppliersPage() {
  const { t } = useTranslation();
  return (
    <GenericTablePage<Supplier>
      title={t('payables.suppliers', 'Suppliers')}
      description={t('payables.suppliersDesc', 'View and manage fuel suppliers')}
      queryKey={['suppliers']}
      queryFn={supplierRepo.list}
      columns={columns}
      entityName="Supplier"
      writePermissions={permissionGroups.payablesRead}
    />
  );
}
