import React from 'react';
import { useTranslation } from 'react-i18next';
import { GenericTablePage } from './GenericTablePage';
import { transferRepo } from '../../lib/repositories';
import { permissionGroups } from '../../lib/permissions';
import { StationToStationTransferForm } from '../forms/StationToStationTransferForm';
import type { Column } from '../ifms/DataTable';

type TransferRow = Awaited<ReturnType<typeof transferRepo.list>>[number];

const columns: Column<TransferRow>[] = [
  { accessorKey: 'transferDate', header: 'Date', sortable: true },
  { accessorKey: 'transferType', header: 'Type', sortable: true },
  { accessorKey: 'fromTankId', header: 'From Tank', cell: (r) => r.fromTankId ?? '—' },
  { accessorKey: 'toTankId', header: 'To Tank', cell: (r) => r.toTankId ?? '—' },
  { accessorKey: 'quantity', header: 'Quantity (L)', sortable: true, cell: (r) => r.quantity.toLocaleString() },
  { accessorKey: 'status', header: 'Status', sortable: true },
];

export default function StationToStationTransfersPage() {
  const { t } = useTranslation();
  return (
    <GenericTablePage<TransferRow>
      title={t('transfers.stationToStation', 'Station-to-Station Transfers')}
      description={t('transfers.stationToStationDesc', 'Transfer stock between different stations')}
      queryKey={['transfers']}
      queryFn={transferRepo.list}
      columns={columns}
      entityName="Transfer"
      FormComponent={StationToStationTransferForm}
      writePermissions={permissionGroups.transfersWrite}
    />
  );
}
