import React from 'react';
import { useTranslation } from 'react-i18next';
import { GenericTablePage } from './GenericTablePage';
import { expenseCategoryRepo } from '../../lib/repositories';
import { permissionGroups } from '../../lib/permissions';
import { ExpenseCategoryForm } from '../forms/ExpenseCategoryForm';
import type { Column } from '../ifms/DataTable';

type CategoryRow = Awaited<ReturnType<typeof expenseCategoryRepo.list>>[number];

const columns: Column<CategoryRow>[] = [
  { accessorKey: 'code', header: 'Code', sortable: true },
  { accessorKey: 'name', header: 'Name', sortable: true },
  { accessorKey: 'description', header: 'Description', cell: (r) => r.description ?? '—' },
  { accessorKey: 'status', header: 'Status', sortable: true },
];

export default function ExpenseCategoriesPage() {
  const { t } = useTranslation();
  return (
    <GenericTablePage<CategoryRow>
      title={t('expenses.categories', 'Expense Categories')}
      description={t('expenses.categoriesDesc', 'Manage expense category classifications')}
      queryKey={['expense-categories']}
      queryFn={expenseCategoryRepo.list}
      columns={columns}
      entityName="Category"
      FormComponent={ExpenseCategoryForm}
      writePermissions={permissionGroups.expensesWrite}
    />
  );
}
