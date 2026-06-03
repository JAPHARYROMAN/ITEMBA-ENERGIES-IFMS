import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useAppStore, useAuthStore } from '../../store';
import { GenericTablePage } from './GenericTablePage';

const translate = vi.hoisted(() => (key: string, options?: string | Record<string, unknown>) => {
  if (typeof options === 'string') return options;
  if (key === 'common.export') return 'Export';
  if (key === 'common.new') return `New ${options?.name}`;
  if (key === 'forms.saveSuccess') return `${options?.entity} saved`;
  if (key === 'pages.genericTitle') return `Edit ${options?.entity}`;
  if (key === 'pages.genericDesc') return `${options?.entity} form`;
  return key;
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate }),
}));

vi.mock('../ifms/PageHeader', async () => {
  const React = await import('react');
  return {
    default: ({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) =>
      React.createElement(
        'header',
        {},
        React.createElement('h1', {}, title),
        description ? React.createElement('p', {}, description) : null,
        actions,
      ),
  };
});

vi.mock('../ifms/FilterBar', async () => {
  const React = await import('react');
  return {
    default: ({
      onSearch,
      onToggleFilters,
    }: {
      onSearch: (value: string) => void;
      onToggleFilters?: () => void;
    }) =>
      React.createElement(
        'div',
        {},
        React.createElement('input', {
          'aria-label': 'Search rows',
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => onSearch(event.target.value),
        }),
        React.createElement(
          'button',
          { type: 'button', onClick: () => onToggleFilters?.() },
          'Toggle filters',
        ),
      ),
  };
});

vi.mock('../ifms/DataTable', async () => {
  const React = await import('react');
  type Column = {
    header: string;
    accessorKey: string;
    cell?: (row: Record<string, unknown>) => React.ReactNode;
  };
  return {
    IFMSDataTable: ({
      data,
      columns,
      onRowClick,
      onEditRow,
      onDeleteRow,
    }: {
      data: Record<string, unknown>[];
      columns: Column[];
      onRowClick?: (row: Record<string, unknown>) => void;
      onEditRow?: (row: Record<string, unknown>) => void;
      onDeleteRow?: (row: Record<string, unknown>) => void;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'generic-table' },
        React.createElement('p', {}, `Rows: ${data.length}`),
        columns.map((column) => React.createElement('span', { key: column.accessorKey }, column.header)),
        data.map((row) => {
          const id = String(row.id);
          return React.createElement(
            'section',
            { key: id, 'data-testid': `row-${id}` },
            columns.map((column) =>
              React.createElement(
                'div',
                { key: `${id}-${column.accessorKey}` },
                column.cell ? column.cell(row) : (row[column.accessorKey] as React.ReactNode),
              ),
            ),
            React.createElement('button', { type: 'button', onClick: () => onRowClick?.(row) }, `Open ${id}`),
            onEditRow
              ? React.createElement('button', { type: 'button', onClick: () => onEditRow(row) }, `Edit ${id}`)
              : null,
            onDeleteRow
              ? React.createElement('button', { type: 'button', onClick: () => onDeleteRow(row) }, `Delete ${id}`)
              : null,
          );
        }),
      ),
  };
});

vi.mock('../ifms/DetailsDrawer', async () => {
  const React = await import('react');
  return {
    default: ({
      isOpen,
      onClose,
      title,
      children,
    }: {
      isOpen: boolean;
      onClose: () => void;
      title: string;
      children: React.ReactNode;
    }) =>
      isOpen
        ? React.createElement(
            'aside',
            { role: 'dialog', 'aria-label': title },
            React.createElement('button', { type: 'button', onClick: onClose }, 'Close drawer'),
            children,
          )
        : null,
  };
});

vi.mock('../ifms/ExportButton', async () => {
  const React = await import('react');
  return {
    ExportButton: ({ label }: { label?: string }) =>
      React.createElement('button', { type: 'button' }, label ?? 'Export'),
  };
});

vi.mock('../ifms/Skeletons', async () => {
  const React = await import('react');
  return { TableSkeleton: () => React.createElement('div', {}, 'Table loading') };
});

type TestRow = { id: string; name: string; category: string; amount: number };

const columns = [
  { header: 'Name', accessorKey: 'name' },
  { header: 'Category', accessorKey: 'category' },
  { header: 'Amount', accessorKey: 'amount', cell: (row: TestRow) => `$${row.amount}` },
];

function renderGeneric({
  queryFn = vi.fn().mockResolvedValue([
    { id: 'row-1', name: 'Diesel Sale', category: 'fuel', amount: 120 },
    { id: 'row-2', name: 'Office Expense', category: 'expense', amount: 35 },
  ]),
  form = false,
  deleteRow,
  permissions = ['items:write'],
}: {
  queryFn?: () => Promise<TestRow[]>;
  form?: boolean;
  deleteRow?: (row: TestRow) => Promise<void> | void;
  permissions?: string[];
} = {}) {
  useAuthStore.setState({
    user: {
      id: 'user-1',
      name: 'Manager',
      email: 'manager@ifms.test',
      role: 'manager',
      permissions,
    },
    isAuthenticated: true,
    isAuthReady: true,
  });

  const FormComponent = ({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) => (
    <div>
      <button type="button" onClick={onSuccess}>
        Save form
      </button>
      <button type="button" onClick={onCancel}>
        Cancel form
      </button>
    </div>
  );

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <GenericTablePage<TestRow>
        title="Test Table"
        description="A table under test"
        queryKey={['test-table', Math.random().toString(36)]}
        queryFn={queryFn}
        columns={columns}
        entityName="Widget"
        FormComponent={form ? FormComponent : undefined}
        onRowClick={vi.fn()}
        onDeleteRow={deleteRow}
        writePermissions={['items:write']}
        deletePermissions={['items:delete']}
      />
    </QueryClientProvider>,
  );
  return { client, queryFn };
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  useAppStore.setState({ toasts: [] });
});

afterEach(cleanup);

describe('GenericTablePage', () => {
  test('renders fetched rows and filters across row values', async () => {
    renderGeneric();

    expect(await screen.findByText('Rows: 2')).toBeInTheDocument();
    expect(screen.getByText('Diesel Sale')).toBeInTheDocument();
    expect(screen.getByText('$120')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search rows'), { target: { value: 'office' } });

    await waitFor(() => expect(screen.getByText('Rows: 1')).toBeInTheDocument());
    expect(screen.getByText('Office Expense')).toBeInTheDocument();
    expect(screen.queryByText('Diesel Sale')).not.toBeInTheDocument();
  });

  test('opens and closes the create drawer when a writable form is available', async () => {
    renderGeneric({ form: true });

    await screen.findByText('Rows: 2');
    fireEvent.click(screen.getByRole('button', { name: 'New Widget' }));
    expect(screen.getByRole('dialog', { name: 'Edit Widget' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save form' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit Widget' })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'New Widget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel form' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit Widget' })).not.toBeInTheDocument());
  });

  test('filter toggle emits the advanced-report toast', async () => {
    renderGeneric({ form: false });

    await screen.findByText('Rows: 2');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle filters' }));

    expect(useAppStore.getState().toasts.at(-1)?.message).toBe(
      'Advanced filters are available in report pages.',
    );
  });

  test('deletes a row when permitted and reports success', async () => {
    const deleteRow = vi.fn().mockResolvedValue(undefined);
    renderGeneric({ deleteRow, permissions: ['items:write', 'items:delete'] });

    await screen.findByText('Rows: 2');
    fireEvent.click(screen.getByRole('button', { name: 'Delete row-1' }));

    await waitFor(() => expect(deleteRow).toHaveBeenCalledWith(expect.objectContaining({ id: 'row-1' })));
    expect(useAppStore.getState().toasts.at(-1)).toMatchObject({
      message: 'Widget saved',
      type: 'success',
    });
  });

  test('reports delete API errors without crashing the table', async () => {
    const deleteRow = vi.fn().mockRejectedValue({ apiError: { message: 'Cannot delete approved row' } });
    renderGeneric({ deleteRow, permissions: ['items:write', 'items:delete'] });

    await screen.findByText('Rows: 2');
    fireEvent.click(screen.getByRole('button', { name: 'Delete row-2' }));

    await waitFor(() =>
      expect(useAppStore.getState().toasts.at(-1)).toMatchObject({
        message: 'Cannot delete approved row',
        type: 'error',
      }),
    );
  });

  test('shows loading and error states from the query', async () => {
    const loadingQuery = vi.fn(() => new Promise<TestRow[]>(() => {}));
    renderGeneric({ queryFn: loadingQuery });

    expect(screen.getByText('Table loading')).toBeInTheDocument();
    cleanup();

    const failingQuery = vi.fn().mockRejectedValue(new Error('Network down'));
    renderGeneric({ queryFn: failingQuery });

    expect(await screen.findByText('Failed to load data. Check connection and try again.')).toBeInTheDocument();
    await waitFor(() =>
      expect(useAppStore.getState().toasts.at(-1)).toMatchObject({
        message: 'Network down',
        type: 'error',
      }),
    );
  });
});
