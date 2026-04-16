import React from 'react';
import { useTranslation } from 'react-i18next';
import { GenericTablePage } from './GenericTablePage';
import { varianceRepo } from '../../lib/repositories';
import { permissionGroups } from '../../lib/permissions';
import type { Column } from '../ifms/DataTable';

type VarianceRow = Awaited<ReturnType<typeof varianceRepo.list>>[number];

const columns: Column<VarianceRow>[] = [
  { accessorKey: 'varianceDate', header: 'Date', sortable: true },
  { accessorKey: 'tankId', header: 'Tank', cell: (r) => r.tankId ?? '—' },
  { accessorKey: 'volumeVariance', header: 'Volume Variance (L)', sortable: true, cell: (r) => r.volumeVariance.toLocaleString() },
  { accessorKey: 'valueVariance', header: 'Value Variance', cell: (r) => r.valueVariance?.toLocaleString() ?? '—' },
  { accessorKey: 'classification', header: 'Classification', cell: (r) => r.classification ?? '—' },
];

export default function VariancesPage() {
  const { t } = useTranslation();
  return (
    <GenericTablePage<VarianceRow>
      title={t('inventory.variance', 'Inventory Variances')}
      description={t('inventory.varianceDesc', 'Track unexplained stock differences')}
      queryKey={['variances']}
      queryFn={varianceRepo.list}
      columns={columns}
      entityName="Variance"
      writePermissions={permissionGroups.inventoryRead}
    />
  );
}
