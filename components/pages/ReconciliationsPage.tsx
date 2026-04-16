import React from 'react';
import { useTranslation } from 'react-i18next';
import { GenericTablePage } from './GenericTablePage';
import { reconciliationRepo } from '../../lib/repositories';
import { permissionGroups } from '../../lib/permissions';
import { ReconciliationForm } from '../forms/ReconciliationForm';
import type { Column } from '../ifms/DataTable';

type ReconciliationRow = Awaited<ReturnType<typeof reconciliationRepo.list>>[number];

const columns: Column<ReconciliationRow>[] = [
  { accessorKey: 'reconciliationDate', header: 'Date', sortable: true },
  { accessorKey: 'expectedVolume', header: 'Expected (L)', cell: (r) => r.expectedVolume?.toLocaleString() ?? '—' },
  { accessorKey: 'actualVolume', header: 'Actual (L)', cell: (r) => r.actualVolume?.toLocaleString() ?? '—' },
  { accessorKey: 'variance', header: 'Variance (L)', cell: (r) => r.variance?.toLocaleString() ?? '—' },
  { accessorKey: 'status', header: 'Status', sortable: true },
];

export default function ReconciliationsPage() {
  const { t } = useTranslation();
  return (
    <GenericTablePage<ReconciliationRow>
      title={t('inventory.reconciliation', 'Inventory Reconciliations')}
      description={t('inventory.reconciliationDesc', 'Compare expected vs actual stock levels')}
      queryKey={['reconciliations']}
      queryFn={reconciliationRepo.list}
      columns={columns}
      entityName="Reconciliation"
      FormComponent={ReconciliationForm}
      writePermissions={permissionGroups.inventoryWrite}
    />
  );
}
