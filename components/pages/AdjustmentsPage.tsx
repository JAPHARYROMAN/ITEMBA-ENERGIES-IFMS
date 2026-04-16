import React from 'react';
import { useTranslation } from 'react-i18next';
import { GenericTablePage } from './GenericTablePage';
import { adjustmentRepo } from '../../lib/repositories';
import { permissionGroups } from '../../lib/permissions';
import { AdjustmentForm } from '../forms/AdjustmentForm';
import type { Column } from '../ifms/DataTable';

type AdjustmentRow = Awaited<ReturnType<typeof adjustmentRepo.list>>[number];

const columns: Column<AdjustmentRow>[] = [
  { accessorKey: 'adjustmentDate', header: 'Date', sortable: true },
  { accessorKey: 'tankId', header: 'Tank', sortable: true },
  { accessorKey: 'volumeDelta', header: 'Delta (L)', sortable: true, cell: (r) => r.volumeDelta.toLocaleString() },
  { accessorKey: 'reason', header: 'Reason', sortable: true },
  { accessorKey: 'status', header: 'Status', sortable: true },
];

export default function AdjustmentsPage() {
  const { t } = useTranslation();
  return (
    <GenericTablePage<AdjustmentRow>
      title={t('transfers.adjustments', 'Stock Adjustments')}
      description={t('transfers.adjustmentsDesc', 'Record and review stock level adjustments')}
      queryKey={['adjustments']}
      queryFn={adjustmentRepo.list}
      columns={columns}
      entityName="Adjustment"
      FormComponent={AdjustmentForm}
      writePermissions={permissionGroups.adjustmentsWrite}
    />
  );
}
