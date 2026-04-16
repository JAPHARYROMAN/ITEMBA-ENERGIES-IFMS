import React from 'react';
import { useTranslation } from 'react-i18next';
import { GenericTablePage } from './GenericTablePage';
import { dipRepo } from '../../lib/repositories';
import { permissionGroups } from '../../lib/permissions';
import { DipForm } from '../forms/DipForm';
import type { Column } from '../ifms/DataTable';

type DipRow = Awaited<ReturnType<typeof dipRepo.list>>[number];

const columns: Column<DipRow>[] = [
  { accessorKey: 'dipDate', header: 'Date', sortable: true },
  { accessorKey: 'tankId', header: 'Tank', sortable: true },
  { accessorKey: 'volume', header: 'Volume (L)', sortable: true, cell: (r) => r.volume.toLocaleString() },
  { accessorKey: 'waterLevel', header: 'Water (mm)', cell: (r) => r.waterLevel?.toString() ?? '—' },
  { accessorKey: 'temperature', header: 'Temp (°C)', cell: (r) => r.temperature?.toString() ?? '—' },
];

export default function DipsPage() {
  const { t } = useTranslation();
  return (
    <GenericTablePage<DipRow>
      title={t('inventory.dips', 'Tank Dip Readings')}
      description={t('inventory.dipsDesc', 'Record and view tank dip measurements')}
      queryKey={['dips']}
      queryFn={dipRepo.list}
      columns={columns}
      entityName="Dip"
      FormComponent={DipForm}
      writePermissions={permissionGroups.inventoryWrite}
    />
  );
}
