import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type * as React from 'react';
import { IFMSDataTable, type Column } from './DataTable';

interface Row {
  id: string;
  name: string;
  amount: number;
  status: string;
}

const rows: Row[] = [
  { id: 'row-b', name: 'Bravo', amount: 300, status: 'Open' },
  { id: 'row-a', name: 'Alpha', amount: 100, status: 'Closed' },
  { id: 'row-c', name: 'Charlie', amount: 200, status: 'Pending' },
];

const columns: Column<Row>[] = [
  { header: 'Name', accessorKey: 'name' },
  { header: 'Amount', accessorKey: 'amount' },
  { header: 'Status', accessorKey: 'status', sortable: false },
];

function renderTable(props: Partial<React.ComponentProps<typeof IFMSDataTable<Row>>> = {}) {
  return render(<IFMSDataTable data={rows} columns={columns} {...props} />);
}

function dataRowTexts() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.textContent ?? '');
}

describe('IFMSDataTable', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:ifms-table'),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('sorts visible data by sortable column in both directions', () => {
    renderTable();

    fireEvent.click(screen.getByText('Amount'));
    expect(dataRowTexts()[0]).toContain('Alpha');
    expect(dataRowTexts()[2]).toContain('Bravo');

    fireEvent.click(screen.getByText('Amount'));
    expect(dataRowTexts()[0]).toContain('Bravo');
    expect(dataRowTexts()[2]).toContain('Alpha');
  });

  test('selects rows and toggles visible columns', () => {
    renderTable();

    expect(screen.getByText('0 Items Flagged')).toBeInTheDocument();
    const checkboxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    fireEvent.click(checkboxes[1]);
    expect(screen.getByText('1 Items Flagged')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Customize Columns'));
    fireEvent.click(screen.getByLabelText('Status'));

    expect(screen.queryByText('Open')).not.toBeInTheDocument();
    expect(screen.queryByText('Closed')).not.toBeInTheDocument();
    expect(screen.getAllByText('Name').length).toBeGreaterThan(0);
  });

  test('selects and clears the full visible page, including rows without ids', () => {
    interface GeneratedRow {
      id?: string | number;
      name: string;
      amount: number;
      status: string;
    }
    const generatedColumns: Column<GeneratedRow>[] = [
      { header: 'Name', accessorKey: 'name' },
      { header: 'Amount', accessorKey: 'amount' },
      { header: 'Status', accessorKey: 'status' },
    ];

    render(
      <IFMSDataTable<GeneratedRow>
        data={[
          { name: 'Generated Alpha', amount: 10, status: 'Open' },
          { name: 'Generated Beta', amount: 20, status: 'Closed' },
        ]}
        columns={generatedColumns}
      />,
    );

    const [toggleAll] = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    fireEvent.click(toggleAll);
    expect(screen.getByText('2 Items Flagged')).toBeInTheDocument();

    fireEvent.click(toggleAll);
    expect(screen.getByText('0 Items Flagged')).toBeInTheDocument();
  });

  test('invokes row, edit, and confirmed delete actions without double-firing row click', () => {
    const onRowClick = vi.fn();
    const onEditRow = vi.fn();
    const onDeleteRow = vi.fn();

    renderTable({ onRowClick, onEditRow, onDeleteRow });

    fireEvent.click(screen.getByText('Bravo'));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);

    fireEvent.click(screen.getAllByLabelText('Edit Record')[0]);
    expect(onEditRow).toHaveBeenCalledWith(rows[0]);
    expect(onRowClick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByLabelText('Delete Record')[0]);
    expect(window.confirm).toHaveBeenCalledWith('Delete this record? This action cannot be undone.');
    expect(onDeleteRow).toHaveBeenCalledWith(rows[0]);
  });

  test('skips delete callbacks when confirmation is declined', () => {
    const onDeleteRow = vi.fn();
    vi.mocked(window.confirm).mockReturnValueOnce(false);

    renderTable({ onDeleteRow });

    fireEvent.click(screen.getAllByLabelText('Delete Record')[0]);
    expect(onDeleteRow).not.toHaveBeenCalled();
  });

  test('exports visible columns to CSV and quotes comma-containing string values', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      <IFMSDataTable
        data={[{ id: 'row-comma', name: 'Alpha, LLC', amount: 50, status: 'Open' }]}
        columns={columns}
      />,
    );

    fireEvent.click(screen.getByLabelText('Export CSV'));

    expect(window.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickSpy).toHaveBeenCalled();
  });

  test('uses server pagination callbacks for page and size controls', () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();

    renderTable({
      data: rows.slice(0, 2),
      serverPagination: {
        page: 2,
        pageSize: 10,
        total: 35,
        onPageChange,
        onPageSizeChange,
      },
    });

    expect(screen.getByText('2 / 4')).toBeInTheDocument();
    const paginationButtons = within(screen.getByText('2 / 4').parentElement!).getAllByRole(
      'button',
    );
    fireEvent.click(paginationButtons[0]);
    expect(onPageChange).toHaveBeenCalledWith(1);

    const nextButton = paginationButtons[1];
    fireEvent.click(nextButton);
    expect(onPageChange).toHaveBeenCalledWith(3);

    fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '20' } });
    expect(onPageSizeChange).toHaveBeenCalledWith(20);
  });

  test('uses local page size and page controls when no server pagination is supplied', () => {
    const manyRows = Array.from({ length: 12 }, (_, index) => ({
      id: `row-${index + 1}`,
      name: `Row ${index + 1}`,
      amount: index + 1,
      status: 'Open',
    }));

    render(<IFMSDataTable data={manyRows} columns={columns} />);

    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    const paginationButtons = within(screen.getByText('1 / 2').parentElement!).getAllByRole(
      'button',
    );
    fireEvent.click(paginationButtons[1]);
    expect(screen.getByText('Row 11')).toBeInTheDocument();

    fireEvent.click(within(screen.getByText('2 / 2').parentElement!).getAllByRole('button')[0]);
    expect(screen.getByText('Row 1')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '20' } });
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });

  test('renders loading and empty table states', () => {
    const { rerender, container } = render(
      <IFMSDataTable data={[]} columns={columns} isLoading />,
    );
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(10);

    rerender(<IFMSDataTable data={[]} columns={columns} />);
    expect(screen.getByText('Database connection idle - No records found')).toBeInTheDocument();
  });
});
